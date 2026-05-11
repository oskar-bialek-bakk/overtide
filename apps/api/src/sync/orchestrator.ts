import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { appConfig, issues, issueRelations, timeEntries } from "../db/schema";
import type { Env } from "../config/env";
import { logger } from "../lib/logger";
import type { RedmineEndpoints } from "../redmine/endpoints";
import type { RedmineIssue, RedmineTimeEntry } from "../redmine/types";
import { classifyIssue } from "./classify";
import { acquireSyncRun, finishSyncRun, SyncInProgressError } from "./lock";
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
    const from = lastSync ? minusDaysIso(lastSync, OVERLAP_BUFFER_DAYS) : undefined;

    const fetchedTE: RedmineTimeEntry[] = [];
    for await (const te of endpoints.iterAllTimeEntries({ userId, from })) fetchedTE.push(te);

    const issueIds = Array.from(new Set(fetchedTE.map((t) => t.issue.id)));
    const fetchedIssues = await endpoints.issuesByIds(issueIds);

    // Build the candidate set of TEs per issue (fresh + already in DB)
    const existingTE = issueIds.length === 0
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
        const owningRole = classified.find((c) => c.issue.id === te.issue.id)?.role;
        if (owningRole === "redemption" && te.activity.id === env.overtimeActivityId) {
          logger.warn({ teId: te.id, issueId: te.issue.id }, "overtime activity on redemption issue — ignored");
          continue;
        }
        const row = normalizeTimeEntry(te);
        await tx.insert(timeEntries).values(row).onConflictDoUpdate({ target: timeEntries.id, set: row });
        teUpserted += 1;
      }

      for (const { issue } of classified) {
        const fresh = (issue.relations ?? [])
          .filter((r) => r.relation_type === "relates")
          .filter((r) => keptIds.has(r.issue_id) && keptIds.has(r.issue_to_id));

        await tx.delete(issueRelations).where(eq(issueRelations.issueFromId, issue.id));
        for (const r of fresh) {
          await tx.insert(issueRelations).values({
            id: r.id, issueFromId: r.issue_id, issueToId: r.issue_to_id,
            relationType: r.relation_type, createdLocally: false,
            mirroredAt: new Date().toISOString(),
          }).onConflictDoUpdate({
            target: issueRelations.id,
            set: { issueFromId: r.issue_id, issueToId: r.issue_to_id, relationType: r.relation_type },
          });
          relUpserted += 1;
        }
      }

      await writeConfig(tx, "last_sync_at", new Date().toISOString());
    });

    await finishSyncRun(db, run.id, {
      status: "success",
      issuesUpserted, timeEntriesUpserted: teUpserted, relationsUpserted: relUpserted,
    });

    return { id: run.id, status: "success" as const, issuesUpserted, timeEntriesUpserted: teUpserted, relationsUpserted: relUpserted };
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
  await db.insert(appConfig).values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date().toISOString() } });
}

function minusDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
