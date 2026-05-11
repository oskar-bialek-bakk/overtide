import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { issues, issueRelations, timeEntries } from "../db/schema";
import { fetchEarnings, fetchRedemptions, fetchRelations } from "../db/queries";
import { AppError, ok } from "../lib/envelope";
import { computeFIFO } from "../matching/fifo";

export function issuesRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.get("/earning", async (c) => {
    const [earnings, redemptions, relations] = await Promise.all([
      fetchEarnings(deps.db, deps.env.overtimeActivityId),
      fetchRedemptions(deps.db),
      fetchRelations(deps.db),
    ]);
    const fifo = computeFIFO({ earnings, redemptions, relations });
    const data = earnings.map((e) => {
      const m = fifo.perEarning.get(e.id) ?? { earned: e.earned, consumed: 0, remaining: e.earned };
      return { ...e, ...m, role: "earning" as const };
    });
    return ok(c, data);
  });

  r.get("/redemption", async (c) => {
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
    const data = redemptions.map((rd) => {
      const m = fifo.perRedemption.get(rd.id) ?? { requested: rd.requested, covered: 0, unlinked: rd.requested };
      return { ...rd, ...m, role: "redemption" as const, linkedEarningIds: linkedByR.get(rd.id) ?? [] };
    });
    return ok(c, data);
  });

  r.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) throw new AppError("BAD_ID", 400, "id must be a number");
    const [issue] = await deps.db.select().from(issues).where(eq(issues.id, id)).limit(1);
    if (!issue) throw new AppError("NOT_FOUND", 404, `issue ${id} not found`);
    const tEntries = await deps.db.select().from(timeEntries).where(eq(timeEntries.issueId, id));
    const rels = await deps.db.select().from(issueRelations).where(
      issue.role === "earning" ? eq(issueRelations.issueFromId, id) : eq(issueRelations.issueToId, id),
    );
    return ok(c, { issue, timeEntries: tEntries, relations: rels });
  });

  return r;
}
