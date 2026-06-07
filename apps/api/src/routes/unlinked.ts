import { Hono } from "hono";
import type { Env } from "../config/env";
import type { Db } from "../db/client";
import { fetchEarnings, fetchRedemptions, fetchRelations } from "../db/queries";
import { ok } from "../lib/envelope";
import { computeFIFO } from "../matching/fifo";

export function unlinkedRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();
  r.get("/", async (c) => {
    const [earnings, redemptions, relations] = await Promise.all([
      fetchEarnings(deps.db, deps.env.overtimeActivityId),
      fetchRedemptions(deps.db),
      fetchRelations(deps.db),
    ]);
    const fifo = computeFIFO({ earnings, redemptions, relations });
    const linkedByR = new Map<number, number[]>();
    for (const rel of relations) {
      const arr = linkedByR.get(rel.redemptionId) ?? [];
      arr.push(rel.earningId);
      linkedByR.set(rel.redemptionId, arr);
    }
    const data = redemptions
      .map((rd) => ({ rd, m: fifo.perRedemption.get(rd.id) }))
      .filter(({ m }) => (m?.unlinked ?? 0) > 0)
      .map(({ rd, m }) => ({
        ...rd,
        ...(m ?? { requested: rd.requested, covered: 0, unlinked: rd.requested }),
        linkedEarningIds: linkedByR.get(rd.id) ?? [],
      }));
    return ok(c, data);
  });
  return r;
}
