// apps/api/src/routes/issues.test.ts — adapt setupDb from balance.test.ts
import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import * as schema from "../db/schema";
import { errorHandler } from "../middleware/errors";
import { issuesRoutes } from "./issues";

const env = {
  redmineUrl: "x",
  auth: { kind: "apiKey" as const, apiKey: "k" },
  redemptionTrackerId: 12,
  overtimeActivityId: 8,
  port: 0,
  logLevel: "info",
};

describe("GET /api/issues/earning", () => {
  it("returns earnings with consumed/remaining", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });
    db.insert(schema.issues)
      .values({
        id: 1,
        role: "earning",
        trackerId: 5,
        trackerName: "Dev",
        projectId: 1,
        projectName: "P",
        subject: "S",
        statusName: "Open",
        createdOn: "2026-01-01T00:00:00Z",
        updatedOn: "2026-01-01T00:00:00Z",
        url: "u",
        rawJson: "{}",
      })
      .run();
    db.insert(schema.timeEntries)
      .values({
        id: 10,
        issueId: 1,
        userId: 7,
        hours: 4,
        activityId: 8,
        activityName: "Nadgodziny",
        spentOn: "2026-01-05",
        createdOn: "x",
        updatedOn: "x",
      })
      .run();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/issues", issuesRoutes({ db, env }));
    const res = await app.request("/api/issues/earning");
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 1, earned: 4, consumed: 0, remaining: 4 });
  });
});
