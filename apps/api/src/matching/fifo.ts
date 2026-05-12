export type FIFOInput = {
  earnings: Array<{ id: number; earned: number; anchorDate: string }>;
  redemptions: Array<{ id: number; requested: number; anchorDate: string }>;
  relations: Array<{
    earningId: number;
    redemptionId: number;
    /** Manual override. NULL → algorithm allocates this pair greedily. */
    allocatedHours?: number | null;
  }>;
};

export type Allocation = { earningId: number; redemptionId: number; hours: number };

export type FIFOResult = {
  allocations: Allocation[];
  perEarning: Map<number, { earned: number; consumed: number; remaining: number }>;
  perRedemption: Map<number, { requested: number; covered: number; unlinked: number }>;
  totals: { earned: number; redeemed: number; available: number; unlinkedHours: number };
};

const byAnchorThenId = (
  a: { anchorDate: string; id: number },
  b: { anchorDate: string; id: number },
) => {
  if (a.anchorDate < b.anchorDate) return -1;
  if (a.anchorDate > b.anchorDate) return 1;
  return a.id - b.id;
};

export function computeFIFO(input: FIFOInput): FIFOResult {
  const earnings = [...input.earnings].sort(byAnchorThenId);
  const redemptions = [...input.redemptions].sort(byAnchorThenId);

  // Build two indexes per redemption: explicit overrides + greedy candidates.
  const overridesFor = new Map<number, Map<number, number>>(); // redemptionId → earningId → hours
  const greedyFor = new Map<number, Set<number>>(); // redemptionId → set of earningId without override
  for (const r of input.relations) {
    if (r.allocatedHours != null && r.allocatedHours > 0) {
      const m = overridesFor.get(r.redemptionId) ?? new Map<number, number>();
      m.set(r.earningId, r.allocatedHours);
      overridesFor.set(r.redemptionId, m);
    } else {
      const set = greedyFor.get(r.redemptionId) ?? new Set<number>();
      set.add(r.earningId);
      greedyFor.set(r.redemptionId, set);
    }
  }

  const consumed = new Map<number, number>();
  const allocations: Allocation[] = [];
  const perRedemption = new Map<number, { requested: number; covered: number; unlinked: number }>();

  // Pass 1 — apply explicit overrides exactly as written, in redemption-date
  // order so we don't surprise the greedy pass with already-spent earnings.
  for (const r of redemptions) {
    const overrides = overridesFor.get(r.id);
    if (!overrides || overrides.size === 0) continue;
    for (const [earningId, hours] of overrides) {
      const used = consumed.get(earningId) ?? 0;
      consumed.set(earningId, used + hours);
      allocations.push({ earningId, redemptionId: r.id, hours });
    }
  }

  // Pass 2 — greedy FIFO for whatever the overrides didn't cover, on each
  // redemption's un-overridden linked earnings (oldest anchor first).
  for (const r of redemptions) {
    const overrideSum = [...(overridesFor.get(r.id)?.values() ?? [])].reduce((s, h) => s + h, 0);
    let remaining = r.requested - overrideSum;
    if (remaining > 0) {
      const greedy = greedyFor.get(r.id) ?? new Set<number>();
      const linkedEarnings = earnings.filter((e) => greedy.has(e.id));
      for (const e of linkedEarnings) {
        if (remaining <= 0) break;
        const used = consumed.get(e.id) ?? 0;
        const available = e.earned - used;
        if (available <= 0) continue;
        const give = Math.min(remaining, available);
        consumed.set(e.id, used + give);
        allocations.push({ earningId: e.id, redemptionId: r.id, hours: give });
        remaining -= give;
      }
    }
    perRedemption.set(r.id, {
      requested: r.requested,
      covered: r.requested - Math.max(remaining, 0),
      unlinked: Math.max(remaining, 0),
    });
  }

  const perEarning = new Map<number, { earned: number; consumed: number; remaining: number }>();
  for (const e of earnings) {
    const used = consumed.get(e.id) ?? 0;
    perEarning.set(e.id, { earned: e.earned, consumed: used, remaining: e.earned - used });
  }

  const totalsEarned = earnings.reduce((s, e) => s + e.earned, 0);
  const totalsRedeemed = allocations.reduce((s, a) => s + a.hours, 0);
  const totalsUnlinked = [...perRedemption.values()].reduce((s, r) => s + r.unlinked, 0);

  return {
    allocations,
    perEarning,
    perRedemption,
    totals: {
      earned: totalsEarned,
      redeemed: totalsRedeemed,
      available: totalsEarned - totalsRedeemed,
      unlinkedHours: totalsUnlinked,
    },
  };
}
