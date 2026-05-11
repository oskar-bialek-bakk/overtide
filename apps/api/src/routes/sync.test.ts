import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "bun:test";
import * as schema from "../db/schema";
import { fixtureSync } from "../../test/fixtures/redmine/sync_basic";
import { startMsw } from "../../test/helpers/msw";
import { Hono } from "hono";
import { syncRoutes } from "./sync";
import { errorHandler } from "../middleware/errors";

const env = { redmineUrl: "https://r.test", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 12, overtimeActivityId: 8, port: 0, logLevel: "info" };

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
      http.get("https://r.test/users/current.json", () => HttpResponse.json({ user: fixtureSync.user })),
      http.get("https://r.test/time_entries.json", () => HttpResponse.json({ time_entries: fixtureSync.timeEntries, total_count: 3, offset: 0, limit: 100 })),
      http.get("https://r.test/issues.json", () => HttpResponse.json({ issues: fixtureSync.issues, total_count: 2 })),
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
});
