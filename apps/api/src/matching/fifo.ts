export type FIFOInput = {
  earnings: Array<{ id: number; earned: number; anchorDate: string }>;
  redemptions: Array<{ id: number; requested: number; anchorDate: string }>;
  relations: Array<{ earningId: number; redemptionId: number }>;
};

export type Allocation = { earningId: number; redemptionId: number; hours: number };

export type FIFOResult = {
  allocations: Allocation[];
  perEarning: Map<number, { earned: number; consumed: number; remaining: number }>;
  perRedemption: Map<number, { requested: number; covered: number; unlinked: number }>;
  totals: { earned: number; redeemed: number; available: number; unlinkedHours: number };
};

const byAnchorThenId = (a: { anchorDate: string; id: number }, b: { anchorDate: string; id: number }) => {
  if (a.anchorDate < b.anchorDate) return -1;
  if (a.anchorDate > b.anchorDate) return 1;
  return a.id - b.id;
};

export function computeFIFO(input: FIFOInput): FIFOResult {
  const earnings = [...input.earnings].sort(byAnchorThenId);
  const redemptions = [...input.redemptions].sort(byAnchorThenId);

  const linksFor = new Map<number, Set<number>>(); // redemptionId → set of earningId
  for (const r of input.relations) {
    const set = linksFor.get(r.redemptionId) ?? new Set<number>();
    set.add(r.earningId);
    linksFor.set(r.redemptionId, set);
  }

  const consumed = new Map<number, number>();
  const allocations: Allocation[] = [];
  const perRedemption = new Map<number, { requested: number; covered: number; unlinked: number }>();

  for (const r of redemptions) {
    const linked = linksFor.get(r.id) ?? new Set<number>();
    const linkedEarnings = earnings.filter((e) => linked.has(e.id));
    let remaining = r.requested;
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
    perRedemption.set(r.id, {
      requested: r.requested,
      covered: r.requested - remaining,
      unlinked: remaining,
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
