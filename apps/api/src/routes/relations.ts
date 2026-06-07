import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../config/env";
import type { Db } from "../db/client";
import { fetchEarnings, fetchRedemptions, fetchRelations } from "../db/queries";
import { issueRelations, issues } from "../db/schema";
import { AppError, ok } from "../lib/envelope";
import { computeFIFO } from "../matching/fifo";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";

const EPSILON = 1e-6;

const createSchema = z.object({
  from_earning_id: z.number().int().positive(),
  to_redemption_id: z.number().int().positive(),
  // Manual override hours for FIFO. Omit (or pass null) → greedy FIFO.
  // Pass a positive number → that exact amount is locked in for this pair.
  allocated_hours: z.number().positive().nullable().optional(),
});

export function relationsRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.post("/", zValidator("json", createSchema), async (c) => {
    const body = c.req.valid("json");
    if (body.from_earning_id === body.to_redemption_id) {
      throw new AppError("SELF_LINK", 400, "cannot link issue to itself");
    }
    const [from] = await deps.db
      .select()
      .from(issues)
      .where(eq(issues.id, body.from_earning_id))
      .limit(1);
    if (!from)
      throw new AppError("ISSUE_NOT_MIRRORED", 404, `issue ${body.from_earning_id} not mirrored`);
    if (from.role !== "earning")
      throw new AppError(
        "ISSUE_NOT_EARNING",
        400,
        `${body.from_earning_id} is not an earning issue`,
      );

    const [to] = await deps.db
      .select()
      .from(issues)
      .where(eq(issues.id, body.to_redemption_id))
      .limit(1);
    if (!to)
      throw new AppError("ISSUE_NOT_MIRRORED", 404, `issue ${body.to_redemption_id} not mirrored`);
    if (to.role !== "redemption")
      throw new AppError(
        "ISSUE_NOT_REDEMPTION",
        400,
        `${body.to_redemption_id} is not a redemption`,
      );

    const allocatedHours = body.allocated_hours ?? null;

    const existing = await deps.db
      .select()
      .from(issueRelations)
      .where(and(eq(issueRelations.issueFromId, from.id), eq(issueRelations.issueToId, to.id)))
      .limit(1);
    if (allocatedHours != null) {
      await validateAllocatedHours({
        db: deps.db,
        env: deps.env,
        earningId: from.id,
        redemptionId: to.id,
        allocatedHours,
      });
    }
    if (existing.length > 0) {
      // Pair already linked in Redmine; only update the local hours override
      // when one was supplied so callers can repurpose POST as "set override".
      if (body.allocated_hours !== undefined) {
        await deps.db
          .update(issueRelations)
          .set({ allocatedHours })
          .where(eq(issueRelations.id, existing[0]!.id));
      }
      return ok(c, { id: existing[0]!.id, status: "ALREADY_LINKED" });
    }

    const endpoints = new RedmineEndpoints(new RedmineClient(deps.env));
    const created = await endpoints.createRelation(from.id, to.id);
    await deps.db.insert(issueRelations).values({
      id: created.id,
      issueFromId: from.id,
      issueToId: to.id,
      relationType: "relates",
      createdLocally: true,
      mirroredAt: new Date().toISOString(),
      allocatedHours,
    });
    return ok(c, { id: created.id, status: "CREATED" });
  });

  r.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) throw new AppError("BAD_ID", 400, "id must be a number");
    const [rel] = await deps.db
      .select()
      .from(issueRelations)
      .where(eq(issueRelations.id, id))
      .limit(1);
    if (!rel) throw new AppError("NOT_FOUND", 404, `relation ${id} not found`);
    if (!rel.createdLocally)
      throw new AppError(
        "RELATION_NOT_OWNED",
        403,
        "can only delete relations created by Overtide",
      );

    const endpoints = new RedmineEndpoints(new RedmineClient(deps.env));
    await endpoints.deleteRelation(id);
    await deps.db.delete(issueRelations).where(eq(issueRelations.id, id));
    return ok(c, { id, status: "DELETED" });
  });

  return r;
}

async function validateAllocatedHours(args: {
  db: Db;
  env: Env;
  earningId: number;
  redemptionId: number;
  allocatedHours: number;
}) {
  const [earnings, redemptions, relations] = await Promise.all([
    fetchEarnings(args.db, args.env.overtimeActivityId),
    fetchRedemptions(args.db),
    fetchRelations(args.db),
  ]);
  const fifo = computeFIFO({ earnings, redemptions, relations });
  const redemption = redemptions.find((r) => r.id === args.redemptionId);
  if (!redemption) {
    throw new AppError(
      "REDEMPTION_NOT_TRACKED",
      400,
      `redemption ${args.redemptionId} has no FIFO entry`,
    );
  }
  if (args.allocatedHours > redemption.requested + EPSILON) {
    throw new AppError(
      "ALLOCATION_EXCEEDS_REDEMPTION",
      400,
      `redemption ${args.redemptionId} requested ${redemption.requested}h, ${args.allocatedHours}h allocated`,
    );
  }

  const earning = fifo.perEarning.get(args.earningId);
  if (!earning) {
    throw new AppError("EARNING_NOT_TRACKED", 400, `earning ${args.earningId} has no FIFO entry`);
  }
  const currentPairConsumption = fifo.allocations
    .filter((a) => a.earningId === args.earningId && a.redemptionId === args.redemptionId)
    .reduce((sum, a) => sum + a.hours, 0);
  const availableForPair = earning.remaining + currentPairConsumption;
  if (args.allocatedHours > availableForPair + EPSILON) {
    throw new AppError(
      "INSUFFICIENT_REMAINING",
      400,
      `earning ${args.earningId} has ${availableForPair}h available for this relation, ${args.allocatedHours}h requested`,
    );
  }
}
