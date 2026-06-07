import { Hono } from "hono";
import type { Db } from "../db/client";
import {
  appConfig,
  issueRelations,
  issues,
  redemptionOperations,
  syncRuns,
  timeEntries,
} from "../db/schema";

export function backupRoutes(deps: { db: Db }) {
  const r = new Hono();

  r.get("/export", async (c) => {
    const exportedAt = new Date().toISOString();
    const payload = {
      version: 1,
      exportedAt,
      issues: await deps.db.select().from(issues),
      timeEntries: await deps.db.select().from(timeEntries),
      issueRelations: await deps.db.select().from(issueRelations),
      syncRuns: await deps.db.select().from(syncRuns),
      redemptionOperations: await deps.db.select().from(redemptionOperations),
      appConfig: await deps.db.select().from(appConfig),
    };
    c.header(
      "Content-Disposition",
      `attachment; filename="overtide-backup-${exportedAt.slice(0, 10)}.json"`,
    );
    return c.json(payload);
  });

  return r;
}
