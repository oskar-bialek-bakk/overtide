import { Hono } from "hono";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { fetchEarnings, fetchRedemptions, fetchRelations } from "../db/queries";
import { ok } from "../lib/envelope";
import { computeFIFO } from "../matching/fifo";

export function balanceRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.get("/", async (c) => {
    const [earnings, redemptions, relations] = await Promise.all([
      fetchEarnings(deps.db, deps.env.overtimeActivityId),
      fetchRedemptions(deps.db),
      fetchRelations(deps.db),
    ]);
    const fifo = computeFIFO({ earnings, redemptions, relations });
    return ok(c, fifo.totals);
  });

  r.get("/timeline", async (c) => {
    // monthly bucket: { month: 'YYYY-MM', earned, redeemed }
    const earnings = await fetchEarnings(deps.db, deps.env.overtimeActivityId);
    const redemptions = await fetchRedemptions(deps.db);
    const buckets = new Map<string, { earned: number; redeemed: number }>();
    const bump = (date: string, field: "earned" | "redeemed", hours: number) => {
      const key = date.slice(0, 7);
      const b = buckets.get(key) ?? { earned: 0, redeemed: 0 };
      b[field] += hours;
      buckets.set(key, b);
    };
    for (const e of earnings) bump(e.anchorDate, "earned", e.earned);
    for (const rd of redemptions) bump(rd.anchorDate, "redeemed", rd.requested);
    const series = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
    return ok(c, series);
  });

  return r;
}
