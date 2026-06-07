import { eq, inArray, or } from "drizzle-orm";
import type { Env } from "../config/env";
import type { Db } from "../db/client";
import { appConfig, issueRelations, issues, timeEntries } from "../db/schema";
import { logger } from "../lib/logger";
import type { RedmineEndpoints } from "../redmine/endpoints";
import type { RedmineIssue, RedmineTimeEntry } from "../redmine/types";
import { classifyIssue } from "./classify";
import { SyncInProgressError, acquireSyncRun, finishSyncRun } from "./lock";
import { normalizeIssue, normalizeTimeEntry } from "./normalize";

const OVERLAP_BUFFER_DAYS = 7;

export async function runSync(args: { db: Db; endpoints: RedmineEndpoints; env: Env }) {
  const { db, endpoints, env } = args;
  const run = await acquireSyncRun(db).catch((e) => {
    if (e instanceof SyncInProgressError) throw e;
    throw e;
  });
  try {
    const userId = await endpoints.currentUserId();

    const lastSync = await readConfig(db, "last_sync_at");
    const incrementalFrom = lastSync ? minusDaysIso(lastSync, OVERLAP_BUFFER_DAYS) : undefined;
    // syncFrom acts as a floor — entries older than it are skipped on every
    // sync. Without it, the first sync pulls everything ever logged.
    const from = clampFloor(incrementalFrom, env.syncFrom);

    const fetchedTE: RedmineTimeEntry[] = [];
    const timeEntryOpts = from ? { userId, from } : { userId };
    for await (const te of endpoints.iterAllTimeEntries(timeEntryOpts)) fetchedTE.push(te);

    const issueIds = Array.from(new Set(fetchedTE.map((t) => t.issue.id)));
    const fetchedIssues = await endpoints.issuesByIds(issueIds);

    // Build the candidate set of TEs per issue (fresh + already in DB)
    const existingTE =
      issueIds.length === 0
        ? []
        : await db.select().from(timeEntries).where(inArray(timeEntries.issueId, issueIds));
    const tesByIssue = new Map<number, { activity: { id: number } }[]>();
    for (const t of existingTE) {
      const arr = tesByIssue.get(t.issueId) ?? [];
      arr.push({ activity: { id: t.activityId } });
      tesByIssue.set(t.issueId, arr);
    }
    for (const t of fetchedTE) {
      const arr = tesByIssue.get(t.issue.id) ?? [];
      arr.push({ activity: { id: t.activity.id } });
      tesByIssue.set(t.issue.id, arr);
    }

    type Classified = { issue: RedmineIssue; role: "earning" | "redemption" };
    const classified: Classified[] = [];
    for (const i of fetchedIssues) {
      const role = classifyIssue(i, tesByIssue.get(i.id) ?? [], env);
      if (role) classified.push({ issue: i, role });
    }
    const keptIds = new Set(classified.map((c) => c.issue.id));
    // O(1) lookup of role-per-issue during the time-entry pass below;
    // a linear find() per entry would be O(n*m) at 10k+ entries.
    const roleByIssueId = new Map(classified.map((c) => [c.issue.id, c.role] as const));

    // Upsert in a transaction
    let issuesUpserted = 0;
    let teUpserted = 0;
    let relUpserted = 0;

    await db.transaction(async (tx) => {
      for (const { issue, role } of classified) {
        const row = normalizeIssue(issue, role, env.redmineUrl);
        await tx.insert(issues).values(row).onConflictDoUpdate({ target: issues.id, set: row });
        issuesUpserted += 1;
      }

      for (const te of fetchedTE) {
        if (!keptIds.has(te.issue.id)) continue;
        const owningRole = roleByIssueId.get(te.issue.id);
        if (owningRole === "redemption" && te.activity.id === env.overtimeActivityId) {
          logger.warn(
            { teId: te.id, issueId: te.issue.id },
            "overtime activity on redemption issue — ignored",
          );
          continue;
        }
        const row = normalizeTimeEntry(te);
        await tx
          .insert(timeEntries)
          .values(row)
          .onConflictDoUpdate({ target: timeEntries.id, set: row });
        teUpserted += 1;
      }

      for (const { issue } of classified) {
        // Full set Redmine still reports for this issue — used for deletion
        // reconciliation regardless of whether the other side is in this
        // incremental window. Filtering deletion by `keptIds` here was a
        // bug: when only the earning had new TE, manual links to a
        // redemption outside the window got wiped.
        const allFresh = (issue.relations ?? []).filter((r) => r.relation_type === "relates");
        // For insert/upsert we need both sides to exist in `issues` (FK).
        // The other side may live in `keptIds` (this sync) or already be in
        // DB from a prior one. Pull roles too, so relation orientation is a
        // local invariant rather than an accident of Redmine's payload order.
        const otherIds = Array.from(
          new Set(allFresh.flatMap((r) => [r.issue_id, r.issue_to_id])),
        ).filter((id) => !keptIds.has(id));
        const knownRows =
          otherIds.length === 0
            ? []
            : await tx
                .select({ id: issues.id, role: issues.role })
                .from(issues)
                .where(inArray(issues.id, otherIds));
        const knownDbRoleById = new Map(knownRows.map((x) => [x.id, x.role] as const));
        const roleOf = (id: number) => roleByIssueId.get(id) ?? knownDbRoleById.get(id);

        const normalizedFresh = allFresh
          .map((r) => ({ raw: r, normalized: normalizeRelatesRelation(r, roleOf) }))
          .filter((r) => r.normalized !== null);
        const validFreshIds = new Set(normalizedFresh.map((r) => r.raw.id));

        const existingConnected = await tx
          .select({ id: issueRelations.id })
          .from(issueRelations)
          .where(
            or(eq(issueRelations.issueFromId, issue.id), eq(issueRelations.issueToId, issue.id)),
          );
        for (const ex of existingConnected) {
          if (!validFreshIds.has(ex.id)) {
            await tx.delete(issueRelations).where(eq(issueRelations.id, ex.id));
          }
        }

        for (const { raw: r, normalized } of normalizedFresh) {
          if (!normalized) continue;
          await tx
            .insert(issueRelations)
            .values({
              id: r.id,
              issueFromId: normalized.earningId,
              issueToId: normalized.redemptionId,
              relationType: r.relation_type,
              createdLocally: false,
              mirroredAt: new Date().toISOString(),
            })
            .onConflictDoUpdate({
              target: issueRelations.id,
              // Intentionally NOT in the set clause: allocatedHours, createdLocally,
              // mirroredAt. Those are local-only state we don't want sync to clobber.
              set: {
                issueFromId: normalized.earningId,
                issueToId: normalized.redemptionId,
                relationType: r.relation_type,
              },
            });
          relUpserted += 1;
        }
      }

      await writeConfig(tx, "last_sync_at", new Date().toISOString());
    });

    await finishSyncRun(db, run.id, {
      status: "success",
      issuesUpserted,
      timeEntriesUpserted: teUpserted,
      relationsUpserted: relUpserted,
    });

    return {
      id: run.id,
      status: "success" as const,
      issuesUpserted,
      timeEntriesUpserted: teUpserted,
      relationsUpserted: relUpserted,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 2048) : String(e);
    await finishSyncRun(db, run.id, { status: "failed", errorMessage: msg });
    throw e;
  }
}

async function readConfig(db: Db, key: string): Promise<string | undefined> {
  const rows = await db.select().from(appConfig).where(eq(appConfig.key, key)).limit(1);
  return rows[0]?.value;
}

async function writeConfig(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date().toISOString() },
    });
}

function minusDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function clampFloor(candidate: string | undefined, floor: string | undefined): string | undefined {
  if (!floor) return candidate;
  if (!candidate) return floor;
  return candidate < floor ? floor : candidate;
}

type IssueRole = "earning" | "redemption";

function normalizeRelatesRelation(
  relation: { issue_id: number; issue_to_id: number },
  roleOf: (id: number) => IssueRole | undefined,
): { earningId: number; redemptionId: number } | null {
  const fromRole = roleOf(relation.issue_id);
  const toRole = roleOf(relation.issue_to_id);
  if (fromRole === "earning" && toRole === "redemption") {
    return { earningId: relation.issue_id, redemptionId: relation.issue_to_id };
  }
  if (fromRole === "redemption" && toRole === "earning") {
    return { earningId: relation.issue_to_id, redemptionId: relation.issue_id };
  }
  return null;
}
