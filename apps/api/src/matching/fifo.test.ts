import { describe, expect, it } from "vitest";
import { computeFIFO, type FIFOInput } from "./fifo";

type Case = {
  name: string;
  input: FIFOInput;
  expect: {
    totalsEarned: number;
    totalsRedeemed: number;
    totalsAvailable: number;
    totalsUnlinked: number;
    perEarning?: Record<number, { consumed: number; remaining: number }>;
    perRedemption?: Record<number, { covered: number; unlinked: number }>;
  };
};

const cases: Case[] = [
  {
    name: "1 OT, 1 R, perfect cover",
    input: {
      earnings: [{ id: 1, earned: 8, anchorDate: "2026-01-01" }],
      redemptions: [{ id: 10, requested: 8, anchorDate: "2026-01-05" }],
      relations: [{ earningId: 1, redemptionId: 10 }],
    },
    expect: { totalsEarned: 8, totalsRedeemed: 8, totalsAvailable: 0, totalsUnlinked: 0 },
  },
  {
    name: "R splits across 2 OTs FIFO",
    input: {
      earnings: [
        { id: 1, earned: 3, anchorDate: "2026-01-01" },
        { id: 2, earned: 5, anchorDate: "2026-01-10" },
      ],
      redemptions: [{ id: 10, requested: 7, anchorDate: "2026-02-01" }],
      relations: [{ earningId: 1, redemptionId: 10 }, { earningId: 2, redemptionId: 10 }],
    },
    expect: {
      totalsEarned: 8, totalsRedeemed: 7, totalsAvailable: 1, totalsUnlinked: 0,
      perEarning: { 1: { consumed: 3, remaining: 0 }, 2: { consumed: 4, remaining: 1 } },
    },
  },
  {
    name: "R exceeds linked → unlinked > 0",
    input: {
      earnings: [{ id: 1, earned: 2, anchorDate: "2026-01-01" }],
      redemptions: [{ id: 10, requested: 5, anchorDate: "2026-01-05" }],
      relations: [{ earningId: 1, redemptionId: 10 }],
    },
    expect: {
      totalsEarned: 2, totalsRedeemed: 2, totalsAvailable: 0, totalsUnlinked: 3,
      perRedemption: { 10: { covered: 2, unlinked: 3 } },
    },
  },
  {
    name: "orphan R (no relations)",
    input: {
      earnings: [{ id: 1, earned: 8, anchorDate: "2026-01-01" }],
      redemptions: [{ id: 10, requested: 4, anchorDate: "2026-01-05" }],
      relations: [],
    },
    expect: { totalsEarned: 8, totalsRedeemed: 0, totalsAvailable: 8, totalsUnlinked: 4 },
  },
  {
    name: "two R's compete for one OT (older first)",
    input: {
      earnings: [{ id: 1, earned: 5, anchorDate: "2026-01-01" }],
      redemptions: [
        { id: 10, requested: 3, anchorDate: "2026-02-01" },
        { id: 11, requested: 4, anchorDate: "2026-02-05" },
      ],
      relations: [{ earningId: 1, redemptionId: 10 }, { earningId: 1, redemptionId: 11 }],
    },
    expect: {
      totalsEarned: 5, totalsRedeemed: 5, totalsAvailable: 0, totalsUnlinked: 2,
      perRedemption: { 10: { covered: 3, unlinked: 0 }, 11: { covered: 2, unlinked: 2 } },
    },
  },
  {
    name: "tie-break by id at equal anchor",
    input: {
      earnings: [
        { id: 2, earned: 1, anchorDate: "2026-01-01" },
        { id: 1, earned: 1, anchorDate: "2026-01-01" },
      ],
      redemptions: [{ id: 10, requested: 1, anchorDate: "2026-02-01" }],
      relations: [{ earningId: 1, redemptionId: 10 }, { earningId: 2, redemptionId: 10 }],
    },
    expect: {
      totalsEarned: 2, totalsRedeemed: 1, totalsAvailable: 1, totalsUnlinked: 0,
      perEarning: { 1: { consumed: 1, remaining: 0 }, 2: { consumed: 0, remaining: 1 } },
    },
  },
  {
    name: "empty inputs",
    input: { earnings: [], redemptions: [], relations: [] },
    expect: { totalsEarned: 0, totalsRedeemed: 0, totalsAvailable: 0, totalsUnlinked: 0 },
  },
];

describe("computeFIFO", () => {
  for (const c of cases) {
    it(c.name, () => {
      const result = computeFIFO(c.input);
      expect(result.totals.earned).toBeCloseTo(c.expect.totalsEarned, 5);
      expect(result.totals.redeemed).toBeCloseTo(c.expect.totalsRedeemed, 5);
      expect(result.totals.available).toBeCloseTo(c.expect.totalsAvailable, 5);
      expect(result.totals.unlinkedHours).toBeCloseTo(c.expect.totalsUnlinked, 5);
      if (c.expect.perEarning) {
        for (const [idStr, exp] of Object.entries(c.expect.perEarning)) {
          const got = result.perEarning.get(Number(idStr))!;
          expect(got.consumed).toBeCloseTo(exp.consumed, 5);
          expect(got.remaining).toBeCloseTo(exp.remaining, 5);
        }
      }
      if (c.expect.perRedemption) {
        for (const [idStr, exp] of Object.entries(c.expect.perRedemption)) {
          const got = result.perRedemption.get(Number(idStr))!;
          expect(got.covered).toBeCloseTo(exp.covered, 5);
          expect(got.unlinked).toBeCloseTo(exp.unlinked, 5);
        }
      }
    });
  }
});
