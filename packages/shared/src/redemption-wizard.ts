import { z } from "zod";

/** Allocation requested by the wizard: take `hours` from earning `earningId`. */
export const wizardAllocationSchema = z.object({
  earningId: z.number().int().positive(),
  hours: z.number().positive(),
});
export type WizardAllocation = z.infer<typeof wizardAllocationSchema>;

/** Input the client POSTs to /api/redemptions/create. */
export const createRedemptionRequestSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    totalHours: z.number().positive(),
    allocations: z.array(wizardAllocationSchema).min(1),
    /** Optional override for the Redmine issue description. When absent the backend
     *  rebuilds it from allocations via {@link buildRedemptionDescription}. */
    description: z.string().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "endDate must be >= startDate", path: ["endDate"] })
  .refine(
    (v) => Math.abs(v.totalHours - v.allocations.reduce((s, a) => s + a.hours, 0)) < 1e-6,
    { message: "sum(allocations) must equal totalHours", path: ["allocations"] },
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

const PL_MONTHS_MAX_DAY = 31;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseISO(d: string): { y: number; m: number; d: number } {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day || m < 1 || m > 12 || day < 1 || day > PL_MONTHS_MAX_DAY) {
    throw new Error(`bad date ${d}`);
  }
  return { y, m, d: day };
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

/** Derive initials from a user's firstname+lastname. Returns empty string if none usable. */
export function deriveInitials(user: { firstname?: string; lastname?: string }): string {
  const f = (user.firstname ?? "").trim();
  const l = (user.lastname ?? "").trim();
  if (!f && !l) return "";
  const fi = f ? f.charAt(0).toUpperCase() : "";
  const li = l ? l.charAt(0).toUpperCase() : "";
  return fi + li;
}

/** Count business days (Mon-Fri) between two ISO dates, inclusive on both ends. */
export function businessDaysBetween(startDate: string, endDate: string): number {
  const s = new Date(`${startDate}T00:00:00Z`);
  const e = new Date(`${endDate}T00:00:00Z`);
  if (e < s) return 0;
  let count = 0;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : String(h);
}
