import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEarning } from "@/api/queries";
import { invalidateRelationQueries, useCreateRelation } from "@/api/mutations";
import { cn } from "@/lib/utils";
import { dateShort, hours } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  redemptionId: number;
  redemptionSubject: string;
  unlinkedHours: number;
};

type Pick = {
  /** Empty string = greedy FIFO. Numeric string = explicit override. */
  hoursInput: string;
};

function parseHours(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function RelationLinker({
  open,
  onOpenChange,
  redemptionId,
  redemptionSubject,
  unlinkedHours,
}: Props) {
  const earningQuery = useEarning();
  const qc = useQueryClient();
  // Bulk path — we manage invalidation manually after the loop.
  const mutation = useCreateRelation({ skipInvalidate: true });
  const candidates = useMemo(
    () =>
      (earningQuery.data ?? [])
        .filter((e) => e.remaining > 0)
        .sort(
          (a, b) => a.anchorDate.localeCompare(b.anchorDate) || a.id - b.id,
        ),
    [earningQuery.data],
  );

  // Map of earningId → { hoursInput }. Presence in the map = selected.
  const [picks, setPicks] = useState<Map<number, Pick>>(new Map());

  const togglePick = (id: number) => {
    const next = new Map(picks);
    if (next.has(id)) next.delete(id);
    else next.set(id, { hoursInput: "" });
    setPicks(next);
  };

  const setHours = (id: number, value: string) => {
    const next = new Map(picks);
    next.set(id, { hoursInput: value });
    setPicks(next);
  };

  // FIFO suggestion: pick earnings in anchor order, fill exactly the override
  // amounts so the user can see the proposed split before submitting.
  const suggestFifo = () => {
    let need = unlinkedHours;
    const next = new Map<number, Pick>();
    for (const c of candidates) {
      if (need <= 0) break;
      const give = Math.min(c.remaining, need);
      next.set(c.id, { hoursInput: String(give) });
      need -= give;
    }
    setPicks(next);
  };

  const explicitTotal = [...picks.values()].reduce(
    (s, p) => s + (parseHours(p.hoursInput) ?? 0),
    0,
  );
  const greedyCount = [...picks.values()].filter((p) => p.hoursInput.trim() === "").length;
  const explicitOver = explicitTotal > unlinkedHours + 0.001;

  const linkAll = async () => {
    for (const [earningId, pick] of picks) {
      const overrideHours = parseHours(pick.hoursInput);
      await mutation.mutateAsync({
        from_earning_id: earningId,
        to_redemption_id: redemptionId,
        ...(overrideHours != null ? { allocated_hours: overrideHours } : {}),
      });
    }
    invalidateRelationQueries(qc);
    onOpenChange(false);
    setPicks(new Map());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link earnings to #{redemptionId}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {redemptionSubject} — needs {hours(unlinkedHours)}. Leave hours blank
            to let FIFO decide; enter a number to lock that exact amount in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {candidates.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No earning issues with remaining hours.
            </div>
          )}
          {candidates.map((c) => {
            const pick = picks.get(c.id);
            const isOn = pick !== undefined;
            const overrideHours = pick ? parseHours(pick.hoursInput) : null;
            const overrideTooHigh =
              overrideHours != null && overrideHours > c.remaining + 0.001;
            return (
              <div
                key={c.id}
                className={cn(
                  "px-3 py-2 rounded-lg border transition-colors",
                  isOn
                    ? "border-primary/60 bg-primary/10"
                    : "border-border hover:border-border/80 hover:bg-secondary/30",
                )}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => togglePick(c.id)}
                    className="flex-1 text-left"
                  >
                    <div className="font-medium">
                      #{c.id} {c.subject}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.projectName} · {dateShort(c.anchorDate)} · {hours(c.remaining)} free
                    </div>
                  </button>
                  {isOn && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={pick.hoursInput}
                        onChange={(e) => setHours(c.id, e.target.value)}
                        placeholder="auto"
                        className={cn(
                          "h-8 w-20 text-right tabular-nums",
                          overrideTooHigh && "border-destructive",
                        )}
                        aria-label={`Hours from #${c.id}`}
                      />
                      <span className="text-xs text-muted-foreground">h</span>
                    </div>
                  )}
                </div>
                {overrideTooHigh && (
                  <div className="mt-1 text-xs text-destructive">
                    only {hours(c.remaining)} available on this earning
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground pt-1">
          Explicit total: <strong className="tabular-nums">{hours(explicitTotal)}</strong>
          {greedyCount > 0 && <> · {greedyCount} link{greedyCount > 1 ? "s" : ""} on FIFO auto</>}
          {explicitOver && (
            <span className="text-destructive ml-2">
              over by {hours(explicitTotal - unlinkedHours)} — trim before linking
            </span>
          )}
        </div>
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            onClick={suggestFifo}
            disabled={candidates.length === 0}
          >
            Suggest FIFO
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={linkAll}
              disabled={picks.size === 0 || mutation.isPending || explicitOver}
            >
              {mutation.isPending
                ? "Linking…"
                : `Link selected (${picks.size})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
