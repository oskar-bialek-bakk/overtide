import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { syncRuns } from "../db/schema";

export class SyncInProgressError extends Error {
  code = "SYNC_IN_PROGRESS" as const;
}

export async function acquireSyncRun(db: Db): Promise<{ id: number }> {
  try {
    const [row] = await db
      .insert(syncRuns)
      .values({ startedAt: new Date().toISOString(), status: "running" })
      .returning({ id: syncRuns.id });
    if (!row) throw new Error("insert returned no row");
    return row;
  } catch (e) {
    if (e instanceof Error && /unique/i.test(e.message)) throw new SyncInProgressError();
    throw e;
  }
}

export async function finishSyncRun(
  db: Db,
  id: number,
  result: {
    status: "success" | "failed";
    issuesUpserted?: number;
    timeEntriesUpserted?: number;
    relationsUpserted?: number;
    errorMessage?: string;
  },
): Promise<void> {
  await db
    .update(syncRuns)
    .set({
      status: result.status,
      finishedAt: new Date().toISOString(),
      issuesUpserted: result.issuesUpserted ?? 0,
      timeEntriesUpserted: result.timeEntriesUpserted ?? 0,
      relationsUpserted: result.relationsUpserted ?? 0,
      errorMessage: result.errorMessage ?? null,
    })
    .where(eq(syncRuns.id, id));
}
