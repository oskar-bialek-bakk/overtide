import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { describe, expect, it } from "bun:test";
import * as schema from "../db/schema";
import { errorHandler } from "../middleware/errors";
import { unlinkedRoutes } from "./unlinked";

const env = { redmineUrl: "x", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 12, overtimeActivityId: 8, port: 0, logLevel: "info" };

function setupDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.issues).values([
    { id: 1, role: "earning", trackerId: 5, trackerName: "Dev", projectId: 1, projectName: "P", subject: "S", statusName: "Open", createdOn: "2026-01-01T00:00:00Z", updatedOn: "2026-01-01T00:00:00Z", url: "u1", rawJson: "{}" },
    { id: 2, role: "redemption", trackerId: 12, trackerName: "Odbior", projectId: 1, projectName: "P", subject: "S", statusName: "Open", createdOn: "2026-02-01T00:00:00Z", updatedOn: "2026-02-01T00:00:00Z", url: "u2", rawJson: "{}" },
  ]).run();
  db.insert(schema.timeEntries).values([
    { id: 10, issueId: 1, userId: 7, hours: 2, activityId: 8, activityName: "Nadgodziny", spentOn: "2026-01-05", createdOn: "x", updatedOn: "x" },
    { id: 11, issueId: 2, userId: 7, hours: 5, activityId: 99, activityName: "Other", spentOn: "2026-02-05", createdOn: "x", updatedOn: "x" },
  ]).run();
  // NO relation between issue 1 and 2 — redemption is unlinked
  return db;
}

describe("GET /api/unlinked", () => {
  it("returns redemption issues with unlinked > 0", async () => {
    const db = setupDb();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/unlinked", unlinkedRoutes({ db, env }));
    const res = await app.request("/api/unlinked");
    const body = await res.json() as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 2, unlinked: 5, covered: 0 });
  });
});
