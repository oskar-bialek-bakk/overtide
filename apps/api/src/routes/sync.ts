import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Env } from "../config/env";
import type { Db } from "../db/client";
import { syncRuns } from "../db/schema";
import { AppError } from "../lib/envelope";
import { ok } from "../lib/envelope";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";
import { SyncInProgressError } from "../sync/lock";
import { runSync } from "../sync/orchestrator";

const STALE_SYNC_MS = 1000 * 60 * 60 * 24 * 7;

export function syncRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.post("/", async (c) => {
    try {
      const endpoints = new RedmineEndpoints(new RedmineClient(deps.env));
      const result = await runSync({ db: deps.db, endpoints, env: deps.env });
      return ok(c, result);
    } catch (e) {
      if (e instanceof SyncInProgressError)
        throw new AppError("SYNC_IN_PROGRESS", 409, "A sync is already running");
      throw e;
    }
  });

  r.get("/history", async (c) => {
    const raw = Number(c.req.query("limit") ?? 20);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : 20;
    const rows = await deps.db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(limit);
    return ok(c, rows);
  });

  r.get("/status", async (c) => {
    const [last] = await deps.db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1);
    const stale = isStaleSyncRun(last ?? null);
    return ok(c, { lastRun: last ?? null, stale });
  });

  r.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) throw new AppError("BAD_ID", 400, "id must be a number");
    const [row] = await deps.db.select().from(syncRuns).where(eq(syncRuns.id, id)).limit(1);
    if (!row) throw new AppError("NOT_FOUND", 404, `sync_run ${id} not found`);
    return ok(c, row);
  });

  return r;
}

function isStaleSyncRun(run: typeof syncRuns.$inferSelect | null) {
  if (!run) return true;
  const timestamp = run.status === "running" ? run.startedAt : run.finishedAt;
  if (!timestamp) return true;
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return true;
  return Date.now() - time > STALE_SYNC_MS;
}
