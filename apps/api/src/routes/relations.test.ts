import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "bun:test";
import * as schema from "../db/schema";
import { startMsw } from "../../test/helpers/msw";
import { Hono } from "hono";
import { relationsRoutes } from "./relations";
import { errorHandler } from "../middleware/errors";

const env = { redmineUrl: "https://r.test", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 12, overtimeActivityId: 8, port: 0, logLevel: "info" };

function seed() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.issues).values([
    { id: 1, role: "earning", trackerId: 5, trackerName: "Dev", projectId: 1, projectName: "P", subject: "S", statusName: "Open", createdOn: "x", updatedOn: "x", url: "u", rawJson: "{}" },
    { id: 2, role: "redemption", trackerId: 12, trackerName: "O", projectId: 1, projectName: "P", subject: "S", statusName: "Open", createdOn: "x", updatedOn: "x", url: "u", rawJson: "{}" },
  ]).run();
  return db;
}

let server: ReturnType<typeof startMsw>;
afterEach(() => server.close());

describe("POST /api/relations", () => {
  it("creates relation in Redmine + DB", async () => {
    server = startMsw(http.post("https://r.test/issues/1/relations.json", async () =>
      HttpResponse.json({ relation: { id: 9999, issue_id: 1, issue_to_id: 2, relation_type: "relates" } })));
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
});
