import { z } from "zod";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isoDateSchema = z
  .string()
  .regex(ISO_DATE_RE)
  .refine(isValidISODate, { message: "date must be a real YYYY-MM-DD date" });

/** Allocation requested by the wizard: take `hours` from earning `earningId`. */
export const wizardAllocationSchema = z.object({
  earningId: z.number().int().positive(),
  hours: z.number().positive(),
});
export type WizardAllocation = z.infer<typeof wizardAllocationSchema>;

/** One row in the per-day breakdown step: `hours` of redemption time on `date`. */
export const wizardDayScheduleEntrySchema = z.object({
  date: isoDateSchema,
  hours: z.number().positive(),
});
export type WizardDayScheduleEntry = z.infer<typeof wizardDayScheduleEntrySchema>;

/** Input the client POSTs to /api/redemptions/create. */
export const createRedemptionRequestSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    totalHours: z.number().positive(),
    allocations: z.array(wizardAllocationSchema).min(1),
    /** Optional override for the Redmine issue description. When absent the backend
     *  rebuilds it from allocations via {@link buildRedemptionDescription}. */
    description: z.string().optional(),
    /** Optional per-day breakdown of redemption hours. When present the backend
     *  uses it to spread time entries across calendar dates instead of dumping
     *  everything on `startDate`. Sum of `hours` must equal `totalHours`. */
    daySchedule: z.array(wizardDayScheduleEntrySchema).min(1).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "endDate must be >= startDate",
    path: ["endDate"],
  })
  .refine((v) => Math.abs(v.totalHours - v.allocations.reduce((s, a) => s + a.hours, 0)) < 1e-6, {
    message: "sum(allocations) must equal totalHours",
    path: ["allocations"],
  })
  .refine(
    (v) =>
      !v.daySchedule ||
      Math.abs(v.totalHours - v.daySchedule.reduce((s, d) => s + d.hours, 0)) < 1e-6,
    { message: "sum(daySchedule.hours) must equal totalHours", path: ["daySchedule"] },
  )
  .refine(
    (v) =>
      !v.daySchedule || v.daySchedule.every((d) => d.date >= v.startDate && d.date <= v.endDate),
    { message: "daySchedule dates must fall inside [startDate, endDate]", path: ["daySchedule"] },
  );
export type CreateRedemptionRequest = z.infer<typeof createRedemptionRequestSchema>;

/** Echo back to the client after a successful create. */
export const createRedemptionResponseSchema = z.object({
  issueId: z.number().int().positive(),
  url: z.string().url(),
  subject: z.string(),
  warning: z.string().nullable().optional(),
});
export type CreateRedemptionResponse = z.infer<typeof createRedemptionResponseSchema>;

/** Earning data the frontend needs to render the description preview parity-correct. */
export type EarningForDescription = { id: number; subject: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseISO(d: string): { y: number; m: number; d: number } {
  const match = ISO_DATE_RE.exec(d);
  if (!match || !isValidISODate(d)) {
    throw new Error(`bad date ${d}`);
  }
  const [, y, m, day] = match;
  return { y: Number(y), m: Number(m), d: Number(day) };
}

function isValidISODate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const [, yText, mText, dText] = match;
  const y = Number(yText);
  const m = Number(mText);
  const d = Number(dText);
  if (y < 1000 || m < 1 || m > 12 || d < 1) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Build the redemption subject from a date range + initials.
 *
 * Single day:        "Odbiór nadgodzin OB 04.05"
 * Same-month range:  "Odbiór nadgodzin OB 04-08.05"
 * Cross-month range: "Odbiór nadgodzin OB 28.04-02.05"
 * Cross-year range:  "Odbiór nadgodzin OB 2026-12-30 — 2027-01-02" (ISO fallback)
 */
export function buildRedemptionSubject(input: {
  startDate: string;
  endDate: string;
  initials: string;
}): string {
  const s = parseISO(input.startDate);
  const e = parseISO(input.endDate);
  const prefix = `Odbiór nadgodzin ${input.initials} `;
  if (s.y !== e.y) return `${prefix}${input.startDate} — ${input.endDate}`;
  if (input.startDate === input.endDate) return `${prefix}${pad(s.d)}.${pad(s.m)}`;
  if (s.m === e.m) return `${prefix}${pad(s.d)}-${pad(e.d)}.${pad(s.m)}`;
  return `${prefix}${pad(s.d)}.${pad(s.m)}-${pad(e.d)}.${pad(e.m)}`;
}

/**
 * Build one description line per allocation:
 *   "Odbiór 4h z #114518 (R&D - support migracji)"
 *
 * Format matches both the redemption-issue description AND each time-entry comment,
 * so the frontend preview can stay parity-aligned with what the backend sends.
 */
export function buildRedemptionLines(
  allocations: WizardAllocation[],
  earningsById: Map<number, EarningForDescription>,
): string[] {
  return allocations.map((a) => {
    const subject = earningsById.get(a.earningId)?.subject ?? "brak danych";
    return `Odbiór ${formatHours(a.hours)}h z #${a.earningId} (${subject})`;
  });
}

export function buildRedemptionDescription(
  allocations: WizardAllocation[],
  earningsById: Map<number, EarningForDescription>,
): string {
  return buildRedemptionLines(allocations, earningsById).join("\n");
}

/**
 * Derive initials from a user's firstname+lastname.
 *
 * Real-world wrinkle: some Redmine instances store an organisation prefix
 * directly in `firstname` (e.g. `"BAKK:Oskar"`). When that prefix shows up we
 * strip everything up to and including the final separator before grabbing the
 * first letter so the result is the user's actual initial, not the org's.
 *
 * Returns empty string when neither field has anything usable.
 */
export function deriveInitials(user: {
  firstname?: string | undefined;
  lastname?: string | undefined;
}): string {
  const f = stripOrgPrefix(user.firstname ?? "");
  const l = stripOrgPrefix(user.lastname ?? "");
  if (!f && !l) return "";
  const fi = f ? f.charAt(0).toUpperCase() : "";
  const li = l ? l.charAt(0).toUpperCase() : "";
  return fi + li;
}

function stripOrgPrefix(s: string): string {
  // Treat ":" (BAKK:Oskar) and "/" (ACME/Jane) as org-prefix separators; take
  // the segment after the last one, then trim whitespace and stray punctuation.
  const trimmed = s.trim();
  if (!trimmed) return "";
  const sepMatch = trimmed.match(/[:/]/);
  if (!sepMatch) return trimmed;
  const lastSep = Math.max(trimmed.lastIndexOf(":"), trimmed.lastIndexOf("/"));
  return trimmed.slice(lastSep + 1).trim();
}

/** Count business days (Mon-Fri) between two ISO dates, inclusive on both ends. */
export function businessDaysBetween(startDate: string, endDate: string): number {
  return enumerateBusinessDays(startDate, endDate).length;
}

/** Enumerate business days (Mon-Fri) between two ISO dates, inclusive on both ends. */
export function enumerateBusinessDays(startDate: string, endDate: string): string[] {
  const s = new Date(`${startDate}T00:00:00Z`);
  const e = new Date(`${endDate}T00:00:00Z`);
  if (e < s) return [];
  const out: string[] = [];
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Default per-day schedule: split `totalHours` evenly across business days.
 * When the total doesn't divide evenly the remainder lands on the last day so
 * the sum still matches exactly (e.g. 25h over 3 business days → 8, 8, 9).
 *
 * Falls back to `[{ date: startDate, hours: totalHours }]` when the range has
 * no business days (weekend-only redemption).
 */
export function defaultDaySchedule(
  startDate: string,
  endDate: string,
  totalHours: number,
): WizardDayScheduleEntry[] {
  const days = enumerateBusinessDays(startDate, endDate);
  if (days.length === 0) return [{ date: startDate, hours: totalHours }];
  const base = Math.floor((totalHours / days.length) * 100) / 100;
  const remainder = round2(totalHours - base * (days.length - 1));
  return days.map((date, i) => ({
    date,
    hours: i === days.length - 1 ? remainder : base,
  }));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : String(h);
}
