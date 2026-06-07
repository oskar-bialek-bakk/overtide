import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../db/schema";
import { SyncInProgressError, acquireSyncRun, finishSyncRun } from "./lock";

function memDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("sync lock", () => {
  it("rejects second acquire while first is running", async () => {
    const db = memDb();
    await acquireSyncRun(db);
    let err: unknown;
    try {
      await acquireSyncRun(db);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SyncInProgressError);
  });

  it("allows new acquire after finish", async () => {
    const db = memDb();
    const first = await acquireSyncRun(db);
    await finishSyncRun(db, first.id, {
      status: "success",
      issuesUpserted: 1,
      timeEntriesUpserted: 2,
      relationsUpserted: 3,
    });
    const second = await acquireSyncRun(db);
    expect(second.id).not.toBe(first.id);
  });
});
