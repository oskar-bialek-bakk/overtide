import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { loadEnv } from "./config/env";
import { createDb } from "./db/client";
import { syncRuns } from "./db/schema";
import { logger } from "./lib/logger";
import { errorHandler } from "./middleware/errors";
import { balanceRoutes } from "./routes/balance";
import { healthRoutes } from "./routes/health";
import { issuesRoutes } from "./routes/issues";
import { redemptionsRoutes } from "./routes/redemptions";
import { relationsRoutes } from "./routes/relations";
import { syncRoutes } from "./routes/sync";
import { unlinkedRoutes } from "./routes/unlinked";

export function createApp(opts?: { dbPath?: string }) {
  const env = loadEnv();
  const db = createDb(opts?.dbPath ?? "./data/overtide.db");

  // Crash recovery: any sync_run left in 'running' state is from a crashed
  // previous process. Mark it failed so the unique-running guard frees up.
  const stuckRows = db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(eq(syncRuns.status, "running"))
    .all();
  db.update(syncRuns)
    .set({
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorMessage: "process exited before sync completed",
    })
    .where(eq(syncRuns.status, "running"))
    .run();
  const stuckCount = stuckRows.length;
  if (stuckCount > 0) {
    logger.warn({ stuckCount }, "marked stuck running sync_runs as failed");
  }

  const app = new Hono();
  app.onError(errorHandler);
  app.route("/api/health", healthRoutes({ db, env }));
  app.route("/api/sync", syncRoutes({ db, env }));
  app.route("/api/balance", balanceRoutes({ db, env }));
  app.route("/api/issues", issuesRoutes({ db, env }));
  app.route("/api/unlinked", unlinkedRoutes({ db, env }));
  app.route("/api/relations", relationsRoutes({ db, env }));
  app.route("/api/redemptions", redemptionsRoutes({ db, env }));
  return { app, env, db };
}
