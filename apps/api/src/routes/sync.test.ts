import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { http, HttpResponse } from "msw";
import { fixtureSync } from "../../test/fixtures/redmine/sync_basic";
import { startMsw } from "../../test/helpers/msw";
import * as schema from "../db/schema";
import { errorHandler } from "../middleware/errors";
import { syncRoutes } from "./sync";

const env = {
  redmineUrl: "https://r.test",
  auth: { kind: "apiKey" as const, apiKey: "k" },
  redemptionTrackerId: 12,
  overtimeActivityId: 8,
  port: 0,
  logLevel: "info",
};

function memDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

let server: ReturnType<typeof startMsw>;
afterEach(() => server.close());

describe("POST /api/sync", () => {
  it("runs sync and returns success", async () => {
    server = startMsw(
      http.get("https://r.test/users/current.json", () =>
        HttpResponse.json({ user: fixtureSync.user }),
      ),
      http.get("https://r.test/time_entries.json", () =>
        HttpResponse.json({
          time_entries: fixtureSync.timeEntries,
          total_count: 3,
          offset: 0,
          limit: 100,
        }),
      ),
      http.get("https://r.test/issues.json", () =>
        HttpResponse.json({ issues: fixtureSync.issues, total_count: 2 }),
      ),
    );
    const db = memDb();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/sync", syncRoutes({ db, env }));
    const res = await app.request("/api/sync", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("success");
  });

  it("returns 409 when sync already running", async () => {
    const db = memDb();
    await db.insert(schema.syncRuns).values({ startedAt: "x", status: "running" });
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/sync", syncRoutes({ db, env }));
    const res = await app.request("/api/sync", { method: "POST" });
    expect(res.status).toBe(409);
  });

  it("returns sync status with stale marker", async () => {
    const db = memDb();
    const finishedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await db.insert(schema.syncRuns).values({
      startedAt: finishedAt,
      finishedAt,
      status: "success",
      issuesUpserted: 2,
      timeEntriesUpserted: 3,
      relationsUpserted: 1,
      relationsSkippedUnknownIssue: 1,
      relationsSkippedSameRole: 0,
      overtimeOnRedemptionIgnored: 1,
    });
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/sync", syncRoutes({ db, env }));

    const res = await app.request("/api/sync/status");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stale).toBe(true);
    expect(body.data.lastRun).toMatchObject({
      status: "success",
      relationsSkippedUnknownIssue: 1,
      overtimeOnRedemptionIgnored: 1,
    });
  });
});
