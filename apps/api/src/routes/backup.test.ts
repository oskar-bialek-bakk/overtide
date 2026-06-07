import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import * as schema from "../db/schema";
import { errorHandler } from "../middleware/errors";
import { backupRoutes } from "./backup";

describe("GET /api/backup/export", () => {
  it("returns a JSON backup with key local tables", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/backup", backupRoutes({ db }));

    const res = await app.request("/api/backup/export");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("overtide-backup-");
    const json = await res.json();
    expect(json.version).toBe(1);
    expect(Array.isArray(json.issues)).toBe(true);
    expect(Array.isArray(json.timeEntries)).toBe(true);
    expect(Array.isArray(json.issueRelations)).toBe(true);
    expect(Array.isArray(json.syncRuns)).toBe(true);
    expect(Array.isArray(json.redemptionOperations)).toBe(true);
    expect(Array.isArray(json.appConfig)).toBe(true);
  });
});
