import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, inArray } from "drizzle-orm";
import {
  buildRedemptionDescription,
  buildRedemptionSubject,
  createRedemptionRequestSchema,
  deriveInitials,
  type EarningForDescription,
} from "@overtide/shared";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { issues, issueRelations, timeEntries } from "../db/schema";
import { fetchEarnings, fetchRedemptions, fetchRelations } from "../db/queries";
import { AppError, ok } from "../lib/envelope";
import { computeFIFO } from "../matching/fifo";
import { logger } from "../lib/logger";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";

const EPSILON = 1e-6;

export function redemptionsRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.post("/create", zValidator("json", createRedemptionRequestSchema), async (c) => {
    const body = c.req.valid("json");

    if (deps.env.vacationsProjectId === undefined) {
      throw new AppError("CONFIG_MISSING", 500, "REDMINE_VACATIONS_PROJECT_ID not configured");
    }
    if (deps.env.redemptionActivityId === undefined) {
      throw new AppError("CONFIG_MISSING", 500, "REDMINE_REDEMPTION_ACTIVITY_ID not configured");
    }

    // 1. Validate every earning exists locally + has enough remaining.
    const earningIds = body.allocations.map((a) => a.earningId);
    const uniqueIds = new Set(earningIds);
    if (uniqueIds.size !== earningIds.length) {
      throw new AppError("DUPLICATE_EARNING", 400, "each earning may appear only once in allocations");
    }
    const earningRows = await deps.db
      .select()
      .from(issues)
      .where(inArray(issues.id, [...uniqueIds]));
    if (earningRows.length !== uniqueIds.size) {
      const missing = [...uniqueIds].filter((id) => !earningRows.find((e) => e.id === id));
      throw new AppError("EARNING_NOT_MIRRORED", 404, `unknown earning(s): ${missing.join(", ")}`);
    }
    for (const row of earningRows) {
      if (row.role !== "earning") {
        throw new AppError("NOT_AN_EARNING", 400, `issue ${row.id} is not an earning`);
      }
    }

    // Re-run FIFO to know each earning's true remaining capacity.
    const [earnings, redemptions, relations] = await Promise.all([
      fetchEarnings(deps.db, deps.env.overtimeActivityId),
      fetchRedemptions(deps.db),
      fetchRelations(deps.db),
    ]);
    const fifo = computeFIFO({ earnings, redemptions, relations });
    for (const alloc of body.allocations) {
      const cap = fifo.perEarning.get(alloc.earningId);
      if (!cap) {
        throw new AppError("EARNING_NOT_TRACKED", 400, `earning ${alloc.earningId} has no FIFO entry`);
      }
      if (alloc.hours > cap.remaining + EPSILON) {
        throw new AppError(
          "INSUFFICIENT_REMAINING",
          400,
          `earning ${alloc.earningId} has ${cap.remaining}h remaining, ${alloc.hours}h requested`,
        );
      }
    }

    // 2. Resolve the user + initials.
    const endpoints = new RedmineEndpoints(new RedmineClient(deps.env));
    const user = await endpoints.currentUser();
    const initials =
      deps.env.userInitials?.trim() ||
      deriveInitials(user) ||
      undefined;
    if (!initials) {
      throw new AppError("INITIALS_UNRESOLVED", 500, "could not derive initials from Redmine user; set USER_INITIALS");
    }

    // 3. Build subject + description.
    const subject = buildRedemptionSubject({
      startDate: body.startDate,
      endDate: body.endDate,
      initials,
    });
    const earningsById = new Map<number, EarningForDescription>(
      earningRows.map((e) => [e.id, { id: e.id, subject: e.subject }]),
    );
    // Honour a client-supplied description verbatim so the user can edit the
    // preview before submitting; fall back to the auto-built one otherwise.
    const description =
      body.description !== undefined && body.description.trim().length > 0
        ? body.description
        : buildRedemptionDescription(body.allocations, earningsById);

    // 4. Create the Redmine issue.
    const createdIssue = await endpoints.createIssue({
      projectId: deps.env.vacationsProjectId,
      trackerId: deps.env.redemptionTrackerId,
      subject,
      description,
      assignedToId: user.id,
      startDate: body.startDate,
      dueDate: body.endDate,
    });

    // Best-effort downstream: time entries + relations. On partial failure we
    // mirror whatever Redmine accepted and return the issue with a warning so
    // the user can finish in the Redmine UI.
    const warnings: string[] = [];
    const createdTimeEntries: Array<{
      teId: number; alloc: { earningId: number; hours: number }; activityName: string;
    }> = [];
    for (const alloc of body.allocations) {
      const lineComment = `Odbiór ${formatHours(alloc.hours)}h z #${alloc.earningId} (${earningsById.get(alloc.earningId)?.subject ?? "brak danych"})`;
      try {
        const te = await endpoints.createTimeEntry({
          issueId: createdIssue.id,
          hours: alloc.hours,
          activityId: deps.env.redemptionActivityId,
          spentOn: body.startDate,
          comments: lineComment,
        });
        createdTimeEntries.push({ teId: te.id, alloc, activityName: te.activity.name });
      } catch (e) {
        warnings.push(`time entry for earning ${alloc.earningId} failed: ${(e as Error).message}`);
        logger.error({ err: e, allocation: alloc, issueId: createdIssue.id }, "create-redemption time-entry failed");
      }
    }
    const createdRelations: Array<{ relId: number; alloc: { earningId: number; hours: number } }> = [];
    for (const alloc of body.allocations) {
      try {
        const rel = await endpoints.createRelation(alloc.earningId, createdIssue.id);
        createdRelations.push({ relId: rel.id, alloc });
      } catch (e) {
        warnings.push(`relation for earning ${alloc.earningId} failed: ${(e as Error).message}`);
        logger.error({ err: e, allocation: alloc, issueId: createdIssue.id }, "create-redemption relation failed");
      }
    }

    // 5. Mirror everything successfully written.
    const url = `${deps.env.redmineUrl}/issues/${createdIssue.id}`;
    const nowISO = new Date().toISOString();
    deps.db.transaction((tx) => {
      tx.insert(issues)
        .values({
          id: createdIssue.id,
          role: "redemption",
          trackerId: createdIssue.tracker.id,
          trackerName: createdIssue.tracker.name,
          projectId: createdIssue.project.id,
          projectName: createdIssue.project.name,
          subject: createdIssue.subject,
          statusName: createdIssue.status.name,
          isClosed: createdIssue.status.is_closed ?? false,
          authorId: createdIssue.author?.id ?? user.id,
          assignedToId: createdIssue.assigned_to?.id ?? user.id,
          createdOn: createdIssue.created_on,
          updatedOn: createdIssue.updated_on,
          startDate: createdIssue.start_date ?? body.startDate,
          dueDate: createdIssue.due_date ?? body.endDate,
          url,
          rawJson: JSON.stringify(createdIssue),
        })
        .onConflictDoUpdate({
          target: issues.id,
          set: {
            subject: createdIssue.subject,
            statusName: createdIssue.status.name,
            updatedOn: createdIssue.updated_on,
            rawJson: JSON.stringify(createdIssue),
          },
        })
        .run();

      for (const { teId, alloc, activityName } of createdTimeEntries) {
        tx.insert(timeEntries)
          .values({
            id: teId,
            issueId: createdIssue.id,
            userId: user.id,
            hours: alloc.hours,
            activityId: deps.env.redemptionActivityId!,
            activityName,
            spentOn: body.startDate,
            comments: `Odbiór ${formatHours(alloc.hours)}h z #${alloc.earningId} (${earningsById.get(alloc.earningId)?.subject ?? "brak danych"})`,
            createdOn: nowISO,
            updatedOn: nowISO,
          })
          .onConflictDoNothing()
          .run();
      }

      for (const { relId, alloc } of createdRelations) {
        tx.insert(issueRelations)
          .values({
            id: relId,
            issueFromId: alloc.earningId,
            issueToId: createdIssue.id,
            relationType: "relates",
            createdLocally: true,
            mirroredAt: nowISO,
            allocatedHours: alloc.hours,
          })
          .onConflictDoNothing()
          .run();
      }
    });

    const warning = warnings.length > 0 ? warnings.join("; ") : null;
    return c.json(
      { data: { issueId: createdIssue.id, url, subject: createdIssue.subject, ...(warning ? { warning } : {}) } },
      201,
    );
  });

  return r;
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : String(h);
}
