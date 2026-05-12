import { sql } from "drizzle-orm";
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
    // Daily series with cumulative balance:
    // { date: 'YYYY-MM-DD', earned, redeemed, cumulative }
    // Source is time_entries directly (not issue anchorDate) so each day is
    // accurate down to the entry. Skips days with no activity.
    const rows = deps.db.all<{ date: string; earned: number; redeemed: number }>(sql`
      SELECT te.spent_on AS date,
             COALESCE(SUM(CASE WHEN i.role = 'earning' AND te.activity_id = ${deps.env.overtimeActivityId} THEN te.hours ELSE 0 END), 0) AS earned,
             COALESCE(SUM(CASE WHEN i.role = 'redemption' THEN te.hours ELSE 0 END), 0) AS redeemed
        FROM time_entries te
        JOIN issues i ON i.id = te.issue_id
       GROUP BY te.spent_on
       ORDER BY te.spent_on ASC
    `);
    let cumulative = 0;
    const series = (rows as Array<{ date: string; earned: number; redeemed: number }>).map((r) => {
      cumulative += r.earned - r.redeemed;
      return { date: r.date, earned: r.earned, redeemed: r.redeemed, cumulative };
    });
    return ok(c, series);
  });

  return r;
}
