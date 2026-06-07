import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import type { Env } from "../config/env";
import { appConfig } from "../db/schema";
import { ok } from "../lib/envelope";
import { RedmineClient } from "../redmine/client";
import { RedmineEndpoints } from "../redmine/endpoints";

export function healthRoutes(deps: { db: Db; env: Env }) {
  const r = new Hono();
  r.get("/", async (c) => {
    const errors: { code: string; message: string }[] = [];
    let redmine: "ok" | "unreachable" | "auth_failed" | "rest_disabled" = "ok";
    try {
      const ep = new RedmineEndpoints(new RedmineClient(deps.env));
      await ep.currentUserId();
    } catch (e) {
      const err = e as { code?: unknown; status?: unknown; message?: unknown };
      if (err.code === "REDMINE_AUTH_FAILED") redmine = "auth_failed";
      else if (err.status === 404) redmine = "rest_disabled";
      else redmine = "unreachable"; // includes status 0: timeout / DNS / TCP / TLS errors
      errors.push({
        code: typeof err.code === "string" ? err.code : "UNKNOWN",
        message: typeof err.message === "string" ? err.message : String(e),
      });
    }
    const [row] = await deps.db.select().from(appConfig).where(eq(appConfig.key, "last_sync_at")).limit(1);
    return ok(c, { redmine, db: "ok", lastSync: row?.value ?? null, errors });
  });
  return r;
}
