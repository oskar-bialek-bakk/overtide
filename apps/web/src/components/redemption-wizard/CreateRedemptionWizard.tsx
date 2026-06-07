import { useCreateRedemption, useRetryRedemptionOperation } from "@/api/mutations";
import { useEarning } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dateShort, hours } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type EarningForDescription,
  type WizardDayScheduleEntry,
  buildRedemptionDescription,
  buildRedemptionSubject,
  businessDaysBetween,
  defaultDaySchedule,
  deriveInitials,
} from "@overtide/shared";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Falls back to deriveInitials at runtime if not provided. */
  fallbackInitials?: string;
};

type Step = "dates" | "earnings" | "days" | "preview";
const STEPS: Step[] = ["dates", "earnings", "days", "preview"];

type DayRow = { date: string; hoursInput: string };
type PartialRedemptionResult = {
  issueId: number;
  warning: string;
  retryableOperationId: number;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function parseHours(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function CreateRedemptionWizard({ open, onOpenChange, fallbackInitials = "OB" }: Props) {
  const earningQuery = useEarning();
  const mutation = useCreateRedemption();
  const retryMutation = useRetryRedemptionOperation();
  const [step, setStep] = useState<Step>("dates");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [totalHoursInput, setTotalHoursInput] = useState("8");
  const [picks, setPicks] = useState<Map<number, string>>(new Map());
  // User-editable description override. Stays in sync with the auto-built
  // string while `descriptionDirty` is false; once the user types into the
  // textarea we stop overwriting their edits.
  const [description, setDescription] = useState("");
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  // Per-day schedule rows (controls the spentOn date on the time entries).
  // Auto-syncs with the date range until the user touches them; then we trust
  // their edits and stop overwriting.
  const [dayRows, setDayRows] = useState<DayRow[]>([]);
  const [dayRowsDirty, setDayRowsDirty] = useState(false);
  const [partialResult, setPartialResult] = useState<PartialRedemptionResult | null>(null);

  // Reset state every time the dialog opens; avoids stale picks from a
  // previous run leaking into a fresh wizard.
  useEffect(() => {
    if (!open) return;
    const t = todayISO();
    setStep("dates");
    setStartDate(t);
    setEndDate(t);
    setTotalHoursInput("8");
    setPicks(new Map());
    setDescription("");
    setDescriptionDirty(false);
    setDayRows([]);
    setDayRowsDirty(false);
    setPartialResult(null);
  }, [open]);

  // Sync default total hours whenever the date range changes — but only if the
  // user hasn't manually edited the field away from the default.
  useEffect(() => {
    const business = businessDaysBetween(startDate, endDate);
    setTotalHoursInput(String(Math.max(business, 1) * 8));
  }, [startDate, endDate]);

  const totalHours = parseHours(totalHoursInput) ?? 0;
  const datesValid = startDate <= endDate && totalHours > 0;

  const candidates = useMemo(
    () =>
      (earningQuery.data ?? [])
        .filter((e) => e.remaining > 0)
        .sort((a, b) => a.anchorDate.localeCompare(b.anchorDate) || a.id - b.id),
    [earningQuery.data],
  );
  const earningsById = useMemo(() => {
    const m = new Map<number, EarningForDescription>();
    for (const e of earningQuery.data ?? []) m.set(e.id, { id: e.id, subject: e.subject });
    return m;
  }, [earningQuery.data]);

  const assigned = useMemo(() => {
    let sum = 0;
    for (const v of picks.values()) sum += parseHours(v) ?? 0;
    return sum;
  }, [picks]);
  const assignedExact = Math.abs(assigned - totalHours) < 1e-6;
  const allocations = useMemo(
    () =>
      [...picks.entries()]
        .map(([earningId, raw]) => ({ earningId, hours: parseHours(raw) ?? 0 }))
        .filter((a) => a.hours > 0),
    [picks],
  );
  const subjectPreview = buildRedemptionSubject({ startDate, endDate, initials: fallbackInitials });
  const descriptionPreview = buildRedemptionDescription(allocations, earningsById);

  // Keep the textarea in sync with the auto-built preview as long as the user
  // hasn't typed into it; once they have, treat their value as authoritative.
  useEffect(() => {
    if (descriptionDirty) return;
    setDescription(descriptionPreview);
  }, [descriptionPreview, descriptionDirty]);

  // Refresh the default day rows whenever the range or total changes — unless
  // the user has already edited them, in which case we leave them alone.
  useEffect(() => {
    if (dayRowsDirty) return;
    if (!datesValid) return;
    const defaults = defaultDaySchedule(startDate, endDate, totalHours);
    setDayRows(defaults.map((d) => ({ date: d.date, hoursInput: String(d.hours) })));
  }, [startDate, endDate, totalHours, datesValid, dayRowsDirty]);

  const dayTotal = useMemo(() => {
    let sum = 0;
    for (const r of dayRows) sum += parseHours(r.hoursInput) ?? 0;
    return sum;
  }, [dayRows]);
  const daysExact = Math.abs(dayTotal - totalHours) < 1e-6;
  const daySchedule: WizardDayScheduleEntry[] = useMemo(
    () =>
      dayRows
        .map((r) => ({ date: r.date, hours: parseHours(r.hoursInput) ?? 0 }))
        .filter((r) => r.hours > 0),
    [dayRows],
  );

  const setDayHours = (idx: number, value: string) => {
    setDayRowsDirty(true);
    setDayRows((prev) => prev.map((r, i) => (i === idx ? { ...r, hoursInput: value } : r)));
  };

  const resetDays = () => {
    setDayRowsDirty(false);
    if (!datesValid) return;
    const defaults = defaultDaySchedule(startDate, endDate, totalHours);
    setDayRows(defaults.map((d) => ({ date: d.date, hoursInput: String(d.hours) })));
  };

  const setHours = (id: number, value: string) => {
    const next = new Map(picks);
    if (value.trim() === "") next.delete(id);
    else next.set(id, value);
    setPicks(next);
  };

  const togglePick = (id: number, remaining: number) => {
    const next = new Map(picks);
    if (next.has(id)) next.delete(id);
    else {
      const stillNeeded = Math.max(0, totalHours - assigned);
      next.set(id, String(Math.min(remaining, stillNeeded || remaining)));
    }
    setPicks(next);
  };

  const suggestFifo = () => {
    let need = totalHours;
    const next = new Map<number, string>();
    for (const c of candidates) {
      if (need <= 0) break;
      const give = Math.min(c.remaining, need);
      next.set(c.id, String(give));
      need -= give;
    }
    setPicks(next);
  };

  const overCap = candidates.some((c) => {
    const v = parseHours(picks.get(c.id) ?? "") ?? 0;
    return v > c.remaining + 1e-6;
  });
  const enoughCapacity = candidates.reduce((s, c) => s + c.remaining, 0) + 1e-6 >= totalHours;

  const idx = STEPS.indexOf(step);
  const goNext = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]!);
  const goPrev = () => setStep(STEPS[Math.max(idx - 1, 0)]!);

  const submit = async () => {
    try {
      const result = await mutation.mutateAsync({
        startDate,
        endDate,
        totalHours,
        allocations,
        ...(description.trim().length > 0 ? { description } : {}),
        ...(daySchedule.length > 0 ? { daySchedule } : {}),
      });
      if (result.warning && result.retryableOperationId) {
        setPartialResult({
          issueId: result.issueId,
          warning: result.warning,
          retryableOperationId: result.retryableOperationId,
        });
        return;
      }
      onOpenChange(false);
    } catch {
      /* useCreateRedemption shows the toast; keep the wizard open so the user can retry */
    }
  };

  const retryPartial = async () => {
    if (!partialResult) return;
    try {
      const result = await retryMutation.mutateAsync(partialResult.retryableOperationId);
      if (result.status === "success") {
        setPartialResult(null);
        onOpenChange(false);
        return;
      }
      setPartialResult((prev) =>
        prev ? { ...prev, warning: result.warning ?? "Retry still has warnings" } : prev,
      );
    } catch {
      /* useRetryRedemptionOperation shows the toast; keep the partial panel open */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New redemption</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Step {idx + 1} of {STEPS.length} — {labelFor(step)}
          </DialogDescription>
        </DialogHeader>

        {step === "dates" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block" htmlFor="redemption-start-date">
                <span className="text-xs text-muted-foreground">Start</span>
                <Input
                  id="redemption-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartDate(v);
                    if (v > endDate) setEndDate(v);
                  }}
                />
              </label>
              <label className="block" htmlFor="redemption-end-date">
                <span className="text-xs text-muted-foreground">End</span>
                <Input
                  id="redemption-end-date"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>
            <label className="block" htmlFor="redemption-total-hours">
              <span className="text-xs text-muted-foreground">
                Total hours · default = business-days × 8h
              </span>
              <Input
                id="redemption-total-hours"
                type="text"
                inputMode="decimal"
                value={totalHoursInput}
                onChange={(e) => setTotalHoursInput(e.target.value)}
              />
            </label>
            <div className="text-xs text-muted-foreground">
              Subject preview: <span className="text-foreground font-medium">{subjectPreview}</span>
            </div>
          </div>
        )}

        {step === "earnings" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Required:{" "}
                <strong className="tabular-nums text-foreground">{hours(totalHours)}</strong>
                {" · Assigned: "}
                <strong
                  className={cn(
                    "tabular-nums",
                    assignedExact ? "text-emerald-500" : "text-amber-500",
                  )}
                >
                  {hours(assigned)}
                </strong>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={suggestFifo}
                disabled={candidates.length === 0}
              >
                <Sparkles size={14} className="mr-1" /> Suggest FIFO
              </Button>
            </div>

            {!enoughCapacity && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                Not enough remaining hours across earnings. Reduce total hours or add more earnings.
              </div>
            )}

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {candidates.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No earnings with remaining hours.
                </div>
              )}
              {candidates.map((c) => {
                const isOn = picks.has(c.id);
                const value = picks.get(c.id) ?? "";
                const parsed = parseHours(value) ?? 0;
                const tooHigh = parsed > c.remaining + 1e-6;
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
                        onClick={() => togglePick(c.id, c.remaining)}
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
                            value={value}
                            onChange={(e) => setHours(c.id, e.target.value)}
                            placeholder="0"
                            className={cn(
                              "h-8 w-20 text-right tabular-nums",
                              tooHigh && "border-destructive",
                            )}
                            aria-label={`Hours from #${c.id}`}
                          />
                          <span className="text-xs text-muted-foreground">h</span>
                        </div>
                      )}
                    </div>
                    {tooHigh && (
                      <div className="mt-1 text-xs text-destructive">
                        only {hours(c.remaining)} available on this earning
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === "days" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Required:{" "}
                <strong className="tabular-nums text-foreground">{hours(totalHours)}</strong>
                {" · Assigned: "}
                <strong
                  className={cn("tabular-nums", daysExact ? "text-emerald-500" : "text-amber-500")}
                >
                  {hours(dayTotal)}
                </strong>
              </div>
              {dayRowsDirty && (
                <button
                  type="button"
                  onClick={resetDays}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  Reset to even split
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {dayRows.map((r, idx) => (
                <div
                  key={r.date}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5"
                >
                  <div className="flex-1 text-sm">{dayLabel(r.date)}</div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={r.hoursInput}
                      onChange={(e) => setDayHours(idx, e.target.value)}
                      placeholder="0"
                      className="h-8 w-20 text-right tabular-nums"
                      aria-label={`Hours for ${r.date}`}
                    />
                    <span className="text-xs text-muted-foreground">h</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              Weekends are skipped by default. Set a day to 0 to omit it (e.g. a public holiday).
              Hours from each day are split across selected earnings proportionally.
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            {partialResult && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <div className="font-medium text-amber-700 dark:text-amber-300">
                  Created #{partialResult.issueId} with warnings
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{partialResult.warning}</div>
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={retryPartial}
                  disabled={retryMutation.isPending}
                >
                  {retryMutation.isPending ? "Retrying..." : "Retry missing items"}
                </Button>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground">Subject</div>
              <div className="font-medium">{subjectPreview}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Dates</div>
              <div className="text-sm">
                {dateShort(startDate)} → {dateShort(endDate)} · total{" "}
                <span className="tabular-nums">{hours(totalHours)}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Description
                  {descriptionDirty && <span className="ml-1 text-amber-500">· edited</span>}
                </div>
                {descriptionDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setDescriptionDirty(false);
                      setDescription(descriptionPreview);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Reset to auto
                  </button>
                )}
              </div>
              <Textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDescriptionDirty(true);
                }}
                rows={Math.max(4, allocations.length + 1)}
                aria-label="Redemption description"
                data-testid="wizard-description"
                className="mt-1 text-xs"
              />
              <div className="mt-1 text-xs text-muted-foreground">
                Time-entry comments are auto-generated per allocation and aren't affected by edits
                here.
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Time entries by day</div>
              <ul className="mt-1 text-sm">
                {daySchedule.map((d) => (
                  <li key={d.date} className="tabular-nums">
                    {dayLabel(d.date)} — {hours(d.hours)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Relations to create</div>
              <ul className="mt-1 text-sm">
                {allocations.map((a) => (
                  <li key={a.earningId} className="tabular-nums">
                    #{a.earningId} → this redemption · {hours(a.hours)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={goPrev} disabled={idx === 0 || mutation.isPending}>
            <ChevronLeft size={14} className="mr-1" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step !== "preview" && (
              <Button
                onClick={goNext}
                disabled={
                  (step === "dates" && !datesValid) ||
                  (step === "earnings" && (!assignedExact || picks.size === 0 || overCap)) ||
                  (step === "days" && (!daysExact || daySchedule.length === 0))
                }
              >
                Next <ChevronRight size={14} className="ml-1" />
              </Button>
            )}
            {step === "preview" && (
              <Button
                onClick={submit}
                disabled={
                  mutation.isPending ||
                  retryMutation.isPending ||
                  partialResult !== null ||
                  allocations.length === 0
                }
              >
                {mutation.isPending ? "Creating…" : "Create redemption"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function labelFor(s: Step) {
  if (s === "dates") return "dates + total hours";
  if (s === "earnings") return "pick earnings";
  if (s === "days") return "distribute across days";
  return "preview + confirm";
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return `${wd} ${md}`;
}

export function defaultInitials(
  user: { firstname?: string | undefined; lastname?: string | undefined } | null | undefined,
) {
  if (!user) return "OB";
  return deriveInitials(user) || "OB";
}
