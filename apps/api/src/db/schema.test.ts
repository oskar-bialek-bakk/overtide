import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

function memDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("schema", () => {
  it("inserts and selects an issue", () => {
    const db = memDb();
    db.insert(schema.issues)
      .values({
        id: 1,
        role: "earning",
        trackerId: 1,
        trackerName: "Development",
        projectId: 1,
        projectName: "P",
        subject: "S",
        statusName: "Open",
        createdOn: "2026-01-01T00:00:00Z",
        updatedOn: "2026-01-01T00:00:00Z",
        url: "https://r/issues/1",
        rawJson: "{}",
      })
      .run();
    const rows = db.select().from(schema.issues).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("earning");
  });

  it("rejects second running sync_run (unique index)", () => {
    const db = memDb();
    db.insert(schema.syncRuns).values({ startedAt: "t1", status: "running" }).run();
    expect(() =>
      db.insert(schema.syncRuns).values({ startedAt: "t2", status: "running" }).run(),
    ).toThrow();
  });
});
