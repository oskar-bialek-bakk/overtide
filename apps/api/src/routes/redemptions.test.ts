import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import * as schema from "../db/schema";
import { startMsw } from "../../test/helpers/msw";
import { redemptionsRoutes } from "./redemptions";
import { errorHandler } from "../middleware/errors";

const baseEnv = {
  redmineUrl: "https://r.test",
  auth: { kind: "apiKey" as const, apiKey: "k" },
  redemptionTrackerId: 19,
  overtimeActivityId: 7,
  vacationsProjectId: 12,
  redemptionActivityId: 8,
  port: 0,
  logLevel: "info",
};

function seedDb(opts: { capacityHoursPerEarning?: number } = {}) {
  const cap = opts.capacityHoursPerEarning ?? 8;
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  // Two earnings, each with `cap`h logged via the overtime activity.
  db.insert(schema.issues).values([
    { id: 114518, role: "earning", trackerId: 5, trackerName: "Dev", projectId: 1, projectName: "P", subject: "R&D - support migracji", statusName: "Open", createdOn: "2026-04-01T00:00:00Z", updatedOn: "2026-04-01T00:00:00Z", url: "https://r.test/issues/114518", rawJson: "{}" },
    { id: 115498, role: "earning", trackerId: 5, trackerName: "Dev", projectId: 1, projectName: "P", subject: "Inny earning", statusName: "Open", createdOn: "2026-04-10T00:00:00Z", updatedOn: "2026-04-10T00:00:00Z", url: "https://r.test/issues/115498", rawJson: "{}" },
  ]).run();
  db.insert(schema.timeEntries).values([
    { id: 1, issueId: 114518, userId: 1039, hours: cap, activityId: 7, activityName: "Nadgodziny", spentOn: "2026-04-15", comments: null, createdOn: "x", updatedOn: "x" },
    { id: 2, issueId: 115498, userId: 1039, hours: cap, activityId: 7, activityName: "Nadgodziny", spentOn: "2026-04-20", comments: null, createdOn: "x", updatedOn: "x" },
  ]).run();
  return { db, sqlite };
}

function makeApp(db: schema.Db | ReturnType<typeof drizzle>, env = baseEnv) {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/redemptions", redemptionsRoutes({ db: db as never, env }));
  return app;
}

let server: ReturnType<typeof startMsw> | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

describe("POST /api/redemptions/create", () => {
  it("posts issue + time entries + relations to Redmine and mirrors locally", async () => {
    const seen: { issues: unknown[]; timeEntries: unknown[]; relations: unknown[] } = {
      issues: [], timeEntries: [], relations: [],
    };
    server = startMsw(
      http.get("https://r.test/users/current.json", () =>
        HttpResponse.json({ user: { id: 1039, login: "oskar.bialek", firstname: "Oskar", lastname: "Białek" } })),
      http.post("https://r.test/issues.json", async ({ request }) => {
        const body = await request.json();
        seen.issues.push(body);
        return HttpResponse.json({
          issue: {
            id: 999, project: { id: 12, name: "urlopy" }, tracker: { id: 19, name: "Odbiór nadgodzin" },
            status: { id: 1, name: "Nowe", is_closed: false }, author: { id: 1039 }, assigned_to: { id: 1039 },
            subject: "Odbiór nadgodzin OB 04.05",
            description: "Odbiór 4h z #114518 (R&D - support migracji)\nOdbiór 4h z #115498 (Inny earning)",
            start_date: "2026-05-04", due_date: "2026-05-04",
            created_on: "2026-05-04T10:00:00Z", updated_on: "2026-05-04T10:00:00Z",
          },
        }, { status: 201 });
      }),
      http.post("https://r.test/time_entries.json", async ({ request }) => {
        const body = await request.json();
        seen.timeEntries.push(body);
        const idx = seen.timeEntries.length;
        return HttpResponse.json({
          time_entry: {
            id: 500 + idx, user: { id: 1039 }, issue: { id: 999 },
            hours: 4, activity: { id: 8, name: "W biurze" }, spent_on: "2026-05-04",
            comments: "", created_on: "2026-05-04T10:00:00Z", updated_on: "2026-05-04T10:00:00Z",
          },
        }, { status: 201 });
      }),
      http.post("https://r.test/issues/:id/relations.json", async ({ request, params }) => {
        const body = await request.json();
        seen.relations.push({ from: params.id, ...(body as object) });
        const idx = seen.relations.length;
        return HttpResponse.json({
          relation: { id: 20000 + idx, issue_id: Number(params.id), issue_to_id: 999, relation_type: "relates" },
        });
      }),
    );

    const { db } = seedDb();
    const app = makeApp(db);
    const res = await app.request("/api/redemptions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-05-04", endDate: "2026-05-04", totalHours: 8,
        allocations: [{ earningId: 114518, hours: 4 }, { earningId: 115498, hours: 4 }],
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as { data: { issueId: number; subject: string; warning?: string } };
    expect(json.data.issueId).toBe(999);
    expect(json.data.subject).toBe("Odbiór nadgodzin OB 04.05");
    expect(json.data.warning).toBeUndefined();

    // Two time entries, two relations were sent.
    expect(seen.timeEntries).toHaveLength(2);
    expect(seen.relations).toHaveLength(2);
    // Subject + description were what the shared builder produced.
    const issueBody = seen.issues[0] as { issue: { subject: string; description: string; project_id: number; tracker_id: number } };
    expect(issueBody.issue.subject).toBe("Odbiór nadgodzin OB 04.05");
    expect(issueBody.issue.description).toBe("Odbiór 4h z #114518 (R&D - support migracji)\nOdbiór 4h z #115498 (Inny earning)");
    expect(issueBody.issue.project_id).toBe(12);
    expect(issueBody.issue.tracker_id).toBe(19);

    // Local DB mirrors everything.
    const mirrored = await db.select().from(schema.issues).where(eqId(999));
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]?.role).toBe("redemption");
    const tes = await db.select().from(schema.timeEntries);
    expect(tes.filter((t) => t.issueId === 999)).toHaveLength(2);
    const rels = await db.select().from(schema.issueRelations);
    expect(rels).toHaveLength(2);
    expect(rels[0]?.allocatedHours).toBe(4);
  });

  it("forwards a client-supplied description verbatim", async () => {
    let issueBody: { issue: { description: string } } | null = null;
    server = startMsw(
      http.get("https://r.test/users/current.json", () =>
        HttpResponse.json({ user: { id: 1039, firstname: "Oskar", lastname: "Białek" } })),
      http.post("https://r.test/issues.json", async ({ request }) => {
        issueBody = (await request.json()) as { issue: { description: string } };
        return HttpResponse.json({
          issue: {
            id: 999, project: { id: 12, name: "urlopy" }, tracker: { id: 19, name: "T" },
            status: { id: 1, name: "Nowe", is_closed: false },
            subject: "Odbiór nadgodzin OB 04.05",
            start_date: "2026-05-04", due_date: "2026-05-04",
            created_on: "2026-05-04T10:00:00Z", updated_on: "2026-05-04T10:00:00Z",
          },
        }, { status: 201 });
      }),
      http.post("https://r.test/time_entries.json", () =>
        HttpResponse.json({
          time_entry: {
            id: 500, user: { id: 1039 }, issue: { id: 999 },
            hours: 4, activity: { id: 8, name: "W biurze" }, spent_on: "2026-05-04",
            comments: "", created_on: "2026-05-04T10:00:00Z", updated_on: "2026-05-04T10:00:00Z",
          },
        }, { status: 201 })),
      http.post("https://r.test/issues/:id/relations.json", ({ params }) =>
        HttpResponse.json({ relation: { id: 1, issue_id: Number(params.id), issue_to_id: 999, relation_type: "relates" } })),
    );

    const { db } = seedDb();
    const app = makeApp(db);
    const res = await app.request("/api/redemptions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-05-04", endDate: "2026-05-04", totalHours: 4,
        allocations: [{ earningId: 114518, hours: 4 }],
        description: "Custom description, not the auto-built one.",
      }),
    });
    expect(res.status).toBe(201);
    expect(issueBody?.issue.description).toBe("Custom description, not the auto-built one.");
  });

  it("rejects when sum(allocations) != totalHours", async () => {
    const { db } = seedDb();
    const app = makeApp(db);
    const res = await app.request("/api/redemptions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-05-04", endDate: "2026-05-04", totalHours: 8,
        allocations: [{ earningId: 114518, hours: 5 }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects over-cap allocation", async () => {
    const { db } = seedDb();
    const app = makeApp(db);
    const res = await app.request("/api/redemptions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-05-04", endDate: "2026-05-04", totalHours: 10,
        allocations: [{ earningId: 114518, hours: 10 }],
      }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe("INSUFFICIENT_REMAINING");
  });

  it("rejects unknown earning", async () => {
    const { db } = seedDb();
    const app = makeApp(db);
    const res = await app.request("/api/redemptions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-05-04", endDate: "2026-05-04", totalHours: 4,
        allocations: [{ earningId: 99999, hours: 4 }],
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe("EARNING_NOT_MIRRORED");
  });

  it("returns a warning when a time entry POST fails after issue creation", async () => {
    server = startMsw(
      http.get("https://r.test/users/current.json", () =>
        HttpResponse.json({ user: { id: 1039, firstname: "Oskar", lastname: "Białek" } })),
      http.post("https://r.test/issues.json", () =>
        HttpResponse.json({
          issue: {
            id: 999, project: { id: 12, name: "urlopy" }, tracker: { id: 19, name: "T" },
            status: { id: 1, name: "Nowe", is_closed: false },
            subject: "Odbiór nadgodzin OB 04.05",
            description: "", start_date: "2026-05-04", due_date: "2026-05-04",
            created_on: "2026-05-04T10:00:00Z", updated_on: "2026-05-04T10:00:00Z",
          },
        }, { status: 201 })),
      http.post("https://r.test/time_entries.json", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
      http.post("https://r.test/issues/:id/relations.json", ({ params }) =>
        HttpResponse.json({ relation: { id: 5000, issue_id: Number(params.id), issue_to_id: 999, relation_type: "relates" } })),
    );

    const { db } = seedDb();
    const app = makeApp(db);
    const res = await app.request("/api/redemptions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-05-04", endDate: "2026-05-04", totalHours: 4,
        allocations: [{ earningId: 114518, hours: 4 }],
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as { data: { issueId: number; warning: string } };
    expect(json.data.warning).toContain("time entry for earning 114518 on 2026-05-04 failed");
  });

  it("spreads time entries across a daySchedule when provided", async () => {
    const teCalls: Array<{ hours: number; spent_on: string }> = [];
    server = startMsw(
      http.get("https://r.test/users/current.json", () =>
        HttpResponse.json({ user: { id: 1039, firstname: "Oskar", lastname: "Białek" } })),
      http.post("https://r.test/issues.json", async () =>
        HttpResponse.json({
          issue: {
            id: 999, project: { id: 12, name: "urlopy" }, tracker: { id: 19, name: "T" },
            status: { id: 1, name: "Nowe", is_closed: false },
            subject: "Odbiór nadgodzin OB 04-06.05",
            start_date: "2026-05-04", due_date: "2026-05-06",
            created_on: "2026-05-04T10:00:00Z", updated_on: "2026-05-04T10:00:00Z",
          },
        }, { status: 201 })),
      http.post("https://r.test/time_entries.json", async ({ request }) => {
        const body = (await request.json()) as { time_entry: { hours: number; spent_on: string } };
        teCalls.push({ hours: body.time_entry.hours, spent_on: body.time_entry.spent_on });
        return HttpResponse.json({
          time_entry: {
            id: 1000 + teCalls.length, user: { id: 1039 }, issue: { id: 999 },
            hours: body.time_entry.hours, activity: { id: 8, name: "W biurze" },
            spent_on: body.time_entry.spent_on, comments: "",
            created_on: "x", updated_on: "x",
          },
        }, { status: 201 });
      }),
      http.post("https://r.test/issues/:id/relations.json", ({ params }) =>
        HttpResponse.json({ relation: { id: Number(params.id), issue_id: Number(params.id), issue_to_id: 999, relation_type: "relates" } })),
    );

    const { db } = seedDb({ capacityHoursPerEarning: 24 });
    const app = makeApp(db);
    const res = await app.request("/api/redemptions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-05-04", endDate: "2026-05-06", totalHours: 24,
        allocations: [
          { earningId: 114518, hours: 16 },
          { earningId: 115498, hours: 8 },
        ],
        daySchedule: [
          { date: "2026-05-04", hours: 8 },
          { date: "2026-05-05", hours: 8 },
          { date: "2026-05-06", hours: 8 },
        ],
      }),
    });
    expect(res.status).toBe(201);
    // 3 days × 2 allocations = 6 time entries. Per day they sum to 8 (16/24×8=5.33,
    // and the last allocation absorbs the rounding so the day sums exactly).
    expect(teCalls).toHaveLength(6);
    const byDate: Record<string, number> = {};
    for (const c of teCalls) byDate[c.spent_on] = (byDate[c.spent_on] ?? 0) + c.hours;
    expect(byDate["2026-05-04"]).toBeCloseTo(8, 2);
    expect(byDate["2026-05-05"]).toBeCloseTo(8, 2);
    expect(byDate["2026-05-06"]).toBeCloseTo(8, 2);
    // Allocations sum to their requested totals across days.
    const dates = teCalls.map((c) => c.spent_on).sort();
    expect(dates).toEqual(["2026-05-04", "2026-05-04", "2026-05-05", "2026-05-05", "2026-05-06", "2026-05-06"]);
    const total = teCalls.reduce((s, c) => s + c.hours, 0);
    expect(total).toBeCloseTo(24, 2);
  });

  it("returns 500 if vacationsProjectId env var is missing", async () => {
    const { db } = seedDb();
    const app = makeApp(db, { ...baseEnv, vacationsProjectId: undefined });
    const res = await app.request("/api/redemptions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-05-04", endDate: "2026-05-04", totalHours: 4,
        allocations: [{ earningId: 114518, hours: 4 }],
      }),
    });
    expect(res.status).toBe(500);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe("CONFIG_MISSING");
  });
});

// Helper — Drizzle's eq is annoying to import in a test; build a tiny matcher.
function eqId(id: number) {
  // We use sql template via Drizzle import directly:
  // imported here to keep tests focused on behaviour.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { eq } = require("drizzle-orm") as typeof import("drizzle-orm");
  return eq(schema.issues.id, id);
}
