import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { http, HttpResponse } from "msw";
import { fixtureSync } from "../../test/fixtures/redmine/sync_basic";
import { startMsw } from "../../test/helpers/msw";
import * as schema from "../db/schema";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";
import { runSync } from "./orchestrator";

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

describe("runSync", () => {
  it("populates db end-to-end", async () => {
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
    const endpoints = new RedmineEndpoints(new RedmineClient(env));
    const result = await runSync({ db, endpoints, env });
    expect(result.status).toBe("success");

    const issues = await db.select().from(schema.issues);
    expect(issues).toHaveLength(2);
    expect(issues.find((i) => i.id === 1)?.role).toBe("earning");
    expect(issues.find((i) => i.id === 2)?.role).toBe("redemption");

    const tes = await db.select().from(schema.timeEntries);
    expect(tes).toHaveLength(3);

    const rels = await db.select().from(schema.issueRelations);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ issueFromId: 1, issueToId: 2, relationType: "relates" });
  });

  it("stores Redmine relations as earning -> redemption even when Redmine reports them reversed", async () => {
    const reversedIssues = fixtureSync.issues.map((issue) => ({
      ...issue,
      relations: [{ id: 500, issue_id: 2, issue_to_id: 1, relation_type: "relates" }],
    }));
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
        HttpResponse.json({ issues: reversedIssues, total_count: 2 }),
      ),
    );
    const db = memDb();
    const endpoints = new RedmineEndpoints(new RedmineClient(env));

    await runSync({ db, endpoints, env });

    const rels = await db.select().from(schema.issueRelations);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ issueFromId: 1, issueToId: 2, relationType: "relates" });
  });

  it("preserves allocated_hours + createdLocally on existing relations across syncs", async () => {
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
    const endpoints = new RedmineEndpoints(new RedmineClient(env));
    // First sync — fixture exposes relation 500 between issues 1 & 2.
    await runSync({ db, endpoints, env });

    // Simulate the wizard / manual linker setting a local-only override on it.
    await db
      .update(schema.issueRelations)
      .set({ allocatedHours: 1.5, createdLocally: true })
      .where(eqId(500));

    // Second sync against the same fixture — must not clobber the override.
    await runSync({ db, endpoints, env });

    const rels = await db.select().from(schema.issueRelations);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.allocatedHours).toBe(1.5);
    expect(rels[0]?.createdLocally).toBe(true);
  });

  it("keeps a manual relation when the other side isn't in this sync's keptIds", async () => {
    // First sync: full fixture. Second sync: only earning issue 1 has new
    // entries — redemption 2 is outside this incremental window, so it
    // never lands in `keptIds`. Redmine still reports the relation on
    // issue 1, so the manual link must survive.
    let issuesCalls = 0;
    server = startMsw(
      http.get("https://r.test/users/current.json", () =>
        HttpResponse.json({ user: fixtureSync.user }),
      ),
      http.get("https://r.test/time_entries.json", () => {
        if (issuesCalls === 0) {
          return HttpResponse.json({
            time_entries: fixtureSync.timeEntries,
            total_count: 3,
            offset: 0,
            limit: 100,
          });
        }
        const earningOnly = fixtureSync.timeEntries.filter((t) => t.issue.id === 1);
        return HttpResponse.json({
          time_entries: earningOnly,
          total_count: earningOnly.length,
          offset: 0,
          limit: 100,
        });
      }),
      http.get("https://r.test/issues.json", () => {
        issuesCalls += 1;
        if (issuesCalls === 1)
          return HttpResponse.json({ issues: fixtureSync.issues, total_count: 2 });
        const earningOnly = fixtureSync.issues.filter((i) => i.id === 1);
        return HttpResponse.json({ issues: earningOnly, total_count: 1 });
      }),
    );
    const db = memDb();
    const endpoints = new RedmineEndpoints(new RedmineClient(env));

    await runSync({ db, endpoints, env });
    // Mark it as manually created so the regression mirrors the real "ręczne linkowanie" path.
    await db.update(schema.issueRelations).set({ createdLocally: true }).where(eqId(500));
    expect((await db.select().from(schema.issueRelations)).length).toBe(1);

    await runSync({ db, endpoints, env });
    const after = await db.select().from(schema.issueRelations);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(500);
    expect(after[0]?.createdLocally).toBe(true);
  });

  it("drops a relation that Redmine no longer reports", async () => {
    // First sync brings relation 500 in; second sync returns issues without it.
    let callCount = 0;
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
      http.get("https://r.test/issues.json", () => {
        callCount += 1;
        if (callCount === 1)
          return HttpResponse.json({ issues: fixtureSync.issues, total_count: 2 });
        const stripped = fixtureSync.issues.map((i) => ({ ...i, relations: [] }));
        return HttpResponse.json({ issues: stripped, total_count: 2 });
      }),
    );
    const db = memDb();
    const endpoints = new RedmineEndpoints(new RedmineClient(env));
    await runSync({ db, endpoints, env });
    expect((await db.select().from(schema.issueRelations)).length).toBe(1);
    await runSync({ db, endpoints, env });
    expect((await db.select().from(schema.issueRelations)).length).toBe(0);
  });

  it("drops a relation when the redemption side no longer reports it", async () => {
    // Redmine exposes relations from both issues. If an incremental sync only
    // fetches the redemption, reconciliation must still inspect links where
    // that issue is the `issue_to_id` in our normalized local table.
    let issuesCalls = 0;
    server = startMsw(
      http.get("https://r.test/users/current.json", () =>
        HttpResponse.json({ user: fixtureSync.user }),
      ),
      http.get("https://r.test/time_entries.json", () => {
        if (issuesCalls === 0) {
          return HttpResponse.json({
            time_entries: fixtureSync.timeEntries,
            total_count: 3,
            offset: 0,
            limit: 100,
          });
        }
        const redemptionOnly = fixtureSync.timeEntries.filter((t) => t.issue.id === 2);
        return HttpResponse.json({
          time_entries: redemptionOnly,
          total_count: redemptionOnly.length,
          offset: 0,
          limit: 100,
        });
      }),
      http.get("https://r.test/issues.json", () => {
        issuesCalls += 1;
        if (issuesCalls === 1)
          return HttpResponse.json({ issues: fixtureSync.issues, total_count: 2 });
        const redemptionOnly = fixtureSync.issues
          .filter((i) => i.id === 2)
          .map((i) => ({ ...i, relations: [] }));
        return HttpResponse.json({ issues: redemptionOnly, total_count: 1 });
      }),
    );
    const db = memDb();
    const endpoints = new RedmineEndpoints(new RedmineClient(env));

    await runSync({ db, endpoints, env });
    expect((await db.select().from(schema.issueRelations)).length).toBe(1);

    await runSync({ db, endpoints, env });

    expect((await db.select().from(schema.issueRelations)).length).toBe(0);
  });
});

// Local helper — Drizzle's eq is awkward in test fixtures; inline import keeps
// the orchestrator test self-contained.
function eqId(id: number) {
  return eq(schema.issueRelations.id, id);
}
