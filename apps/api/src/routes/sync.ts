import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { syncRuns } from "../db/schema";
import { AppError } from "../lib/envelope";
import { ok } from "../lib/envelope";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";
import { runSync } from "../sync/orchestrator";
import { SyncInProgressError } from "../sync/lock";

export function syncRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();

  r.post("/", async (c) => {
    try {
      const endpoints = new RedmineEndpoints(new RedmineClient(deps.env));
      const result = await runSync({ db: deps.db, endpoints, env: deps.env });
      return ok(c, result);
    } catch (e) {
      if (e instanceof SyncInProgressError) throw new AppError("SYNC_IN_PROGRESS", 409, "A sync is already running");
      throw e;
    }
  });

  r.get("/history", async (c) => {
    const raw = Number(c.req.query("limit") ?? 20);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : 20;
    const rows = await deps.db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(limit);
    return ok(c, rows);
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
