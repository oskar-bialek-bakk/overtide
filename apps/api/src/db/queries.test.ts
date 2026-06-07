import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { fetchEarnings, fetchRedemptions, fetchRelations } from "./queries";
import * as schema from "./schema";

function memDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("db/queries", () => {
  it("aggregates earning hours from overtime time entries only", async () => {
    const db = memDb();
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
          createdOn: "2026-01-01T00:00:00Z",
          updatedOn: "2026-01-01T00:00:00Z",
          url: "u1",
          rawJson: "{}",
        },
        {
          id: 2,
          role: "redemption",
          trackerId: 12,
          trackerName: "Odbior",
          projectId: 1,
          projectName: "P",
          subject: "S",
          statusName: "Open",
          createdOn: "2026-02-01T00:00:00Z",
          updatedOn: "2026-02-01T00:00:00Z",
          url: "u2",
          rawJson: "{}",
        },
      ])
      .run();
    db.insert(schema.timeEntries)
      .values([
        {
          id: 10,
          issueId: 1,
          userId: 7,
          hours: 3,
          activityId: 8,
          activityName: "Nadgodziny",
          spentOn: "2026-01-05",
          createdOn: "x",
          updatedOn: "x",
        },
        {
          id: 11,
          issueId: 1,
          userId: 7,
          hours: 5,
          activityId: 99,
          activityName: "Other",
          spentOn: "2026-01-06",
          createdOn: "x",
          updatedOn: "x",
        },
        {
          id: 12,
          issueId: 2,
          userId: 7,
          hours: 4,
          activityId: 99,
          activityName: "Other",
          spentOn: "2026-02-05",
          createdOn: "x",
          updatedOn: "x",
        },
      ])
      .run();
    db.insert(schema.issueRelations)
      .values({ id: 500, issueFromId: 1, issueToId: 2, relationType: "relates", mirroredAt: "x" })
      .run();

    const earnings = await fetchEarnings(db, 8);
    expect(earnings).toHaveLength(1);
    expect(earnings[0]?.earned).toBe(3);
    expect(earnings[0]?.id).toBe(1);

    const redemptions = await fetchRedemptions(db);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]?.requested).toBe(4);

    const relations = await fetchRelations(db);
    expect(relations).toEqual([{ earningId: 1, redemptionId: 2, allocatedHours: null }]);
  });
});
