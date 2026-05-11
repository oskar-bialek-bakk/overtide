import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

function memDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("schema", () => {
  it("inserts and selects an issue", async () => {
    const db = memDb();
    await db.insert(schema.issues).values({
      id: 1, role: "earning", trackerId: 1, trackerName: "Development",
      projectId: 1, projectName: "P", subject: "S", statusName: "Open",
      createdOn: "2026-01-01T00:00:00Z", updatedOn: "2026-01-01T00:00:00Z",
      url: "https://r/issues/1", rawJson: "{}",
    });
    const rows = await db.select().from(schema.issues);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("earning");
  });

  it("rejects second running sync_run (unique index)", async () => {
    const db = memDb();
    await db.insert(schema.syncRuns).values({ startedAt: "t1", status: "running" });
    await expect(
      db.insert(schema.syncRuns).values({ startedAt: "t2", status: "running" }),
    ).rejects.toThrow();
  });
});
