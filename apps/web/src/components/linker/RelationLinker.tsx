import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEarning } from "@/api/queries";
import { useCreateRelation } from "@/api/mutations";
import { cn } from "@/lib/cn";
import { dateShort, hours } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  redemptionId: number;
  redemptionSubject: string;
  unlinkedHours: number;
};

export function RelationLinker({
  open,
  onOpenChange,
  redemptionId,
  redemptionSubject,
  unlinkedHours,
}: Props) {
  const earningQuery = useEarning();
  const mutation = useCreateRelation();
  const candidates = useMemo(
    () =>
      (earningQuery.data ?? [])
        .filter((e) => e.remaining > 0)
        .sort(
          (a, b) => a.anchorDate.localeCompare(b.anchorDate) || a.id - b.id,
        ),
    [earningQuery.data],
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const suggestFifo = () => {
    let need = unlinkedHours;
    const next = new Set<number>();
    for (const c of candidates) {
      if (need <= 0) break;
      next.add(c.id);
      need -= c.remaining;
    }
    setSelected(next);
  };

  const linkAll = async () => {
    for (const id of selected) {
      await mutation.mutateAsync({
        from_earning_id: id,
        to_redemption_id: redemptionId,
      });
    }
    onOpenChange(false);
    setSelected(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Link earnings to #{redemptionId}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {redemptionSubject} — needs {hours(unlinkedHours)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {candidates.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No earning issues with remaining hours.
            </div>
          )}
          {candidates.map((c) => {
            const isOn = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (isOn) next.delete(c.id);
                  else next.add(c.id);
                  setSelected(next);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg border transition-colors",
                  isOn
                    ? "border-primary/60 bg-primary/10"
                    : "border-border hover:border-border/80 hover:bg-secondary/30",
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      #{c.id} {c.subject}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.projectName} · {dateShort(c.anchorDate)}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums">{hours(c.remaining)} free</div>
                </div>
              </button>
            );
          })}
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
              disabled={selected.size === 0 || mutation.isPending}
            >
              {mutation.isPending
                ? "Linking…"
                : `Link selected (${selected.size})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
