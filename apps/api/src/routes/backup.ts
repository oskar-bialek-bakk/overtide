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
    const payload = await deps.db.transaction(async (tx) => ({
      version: 1,
      exportedAt,
      issues: await tx.select().from(issues),
      timeEntries: await tx.select().from(timeEntries),
      issueRelations: await tx.select().from(issueRelations),
      syncRuns: await tx.select().from(syncRuns),
      redemptionOperations: await tx.select().from(redemptionOperations),
      appConfig: await tx.select().from(appConfig),
    }));
    c.header("Cache-Control", "no-store");
    c.header(
      "Content-Disposition",
      `attachment; filename="overtide-backup-${exportedAt.slice(0, 10)}.json"`,
    );
    return c.json(payload);
  });

  return r;
}
