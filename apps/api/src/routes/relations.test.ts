import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Hono } from "hono";
import { http, HttpResponse } from "msw";
import { startMsw } from "../../test/helpers/msw";
import * as schema from "../db/schema";
import { errorHandler } from "../middleware/errors";
import { relationsRoutes } from "./relations";

const env = {
  redmineUrl: "https://r.test",
  auth: { kind: "apiKey" as const, apiKey: "k" },
  redemptionTrackerId: 12,
  overtimeActivityId: 8,
  port: 0,
  logLevel: "info",
};

function seed() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.issues)
    .values([
      {
        id: 1,
        role: "earning",
        trackerId: 5,
        trackerName: "Dev",
        projectId: 1,
        projectName: "P",
        subject: "S",
        statusName: "Open",
        createdOn: "x",
        updatedOn: "x",
        url: "u",
        rawJson: "{}",
      },
      {
        id: 2,
        role: "redemption",
        trackerId: 12,
        trackerName: "O",
        projectId: 1,
        projectName: "P",
        subject: "S",
        statusName: "Open",
        createdOn: "x",
        updatedOn: "x",
        url: "u",
        rawJson: "{}",
      },
    ])
    .run();
  db.insert(schema.timeEntries)
    .values([
      {
        id: 1,
        issueId: 1,
        userId: 10,
        hours: 8,
        activityId: 8,
        activityName: "Nadgodziny",
        spentOn: "2026-01-01",
        comments: null,
        createdOn: "x",
        updatedOn: "x",
      },
      {
        id: 2,
        issueId: 2,
        userId: 10,
        hours: 12,
        activityId: 9,
        activityName: "Odbiór",
        spentOn: "2026-01-10",
        comments: null,
        createdOn: "x",
        updatedOn: "x",
      },
    ])
    .run();
  return db;
}

let server: ReturnType<typeof startMsw>;
afterEach(() => server.close());

describe("POST /api/relations", () => {
  it("creates relation in Redmine + DB", async () => {
    server = startMsw(
      http.post("https://r.test/issues/1/relations.json", async () =>
        HttpResponse.json({
          relation: { id: 9999, issue_id: 1, issue_to_id: 2, relation_type: "relates" },
        }),
      ),
    );
    const db = seed();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/relations", relationsRoutes({ db, env }));
    const res = await app.request("/api/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_earning_id: 1, to_redemption_id: 2 }),
    });
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.issueRelations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 9999, createdLocally: true });
  });

  it("returns 400 on cross-role mismatch", async () => {
    const db = seed();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/relations", relationsRoutes({ db, env }));
    const res = await app.request("/api/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_earning_id: 2, to_redemption_id: 1 }), // swapped
    });
    expect(res.status).toBe(400);
  });

  it("rejects an allocated_hours override above the earning's remaining capacity", async () => {
    const db = seed();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/relations", relationsRoutes({ db, env }));
    const res = await app.request("/api/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_earning_id: 1, to_redemption_id: 2, allocated_hours: 9 }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("INSUFFICIENT_REMAINING");
    const rows = await db.select().from(schema.issueRelations);
    expect(rows).toHaveLength(0);
  });

  it("rejects an allocated_hours override above the redemption's requested hours", async () => {
    const db = seed();
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/api/relations", relationsRoutes({ db, env }));
    const res = await app.request("/api/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_earning_id: 1, to_redemption_id: 2, allocated_hours: 13 }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("ALLOCATION_EXCEEDS_REDEMPTION");
  });
});
