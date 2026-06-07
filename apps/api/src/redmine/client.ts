import type { Env } from "../config/env";
import { buildAuthHeaders } from "./auth";

export class RedmineError extends Error {
  constructor(public code: string, public status: number, public path: string, message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

export class RedmineClient {
  constructor(private env: Env) {}

  async get(path: string, params: Record<string, string | number | undefined> = {}): Promise<unknown> {
    const url = new URL(this.env.redmineUrl + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    return this.request("GET", url.toString());
  }

  async post(path: string, body: unknown): Promise<unknown> {
    return this.request("POST", this.env.redmineUrl + path, body);
  }

  async delete(path: string): Promise<unknown> {
    return this.request("DELETE", this.env.redmineUrl + path);
  }

  private async request(method: string, url: string, body?: unknown): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const init: RequestInit = {
          method,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...buildAuthHeaders(this.env),
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        };
        if (body !== undefined) init.body = JSON.stringify(body);
        const res = await fetch(url, init);
        if (res.status === 401 || res.status === 403) {
          throw new RedmineError("REDMINE_AUTH_FAILED", res.status, url, "auth failed");
        }
        if (res.status === 429 || res.status >= 500) {
          if (attempt < MAX_ATTEMPTS) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw new RedmineError(
            res.status === 429 ? "REDMINE_RATE_LIMITED" : `REDMINE_HTTP_${res.status}`,
            res.status, url, `failed after ${MAX_ATTEMPTS} attempts`,
          );
        }
        if (!res.ok) {
          throw new RedmineError(`REDMINE_HTTP_${res.status}`, res.status, url, await res.text());
        }
        if (res.status === 204) return null;
        return await res.json();
      } catch (e) {
        if (e instanceof RedmineError && e.code === "REDMINE_AUTH_FAILED") throw e;
        if (e instanceof Error && e.name === "TimeoutError") {
          if (attempt < MAX_ATTEMPTS) {
            await sleep(backoffMs(attempt));
            continue;
          }
          throw new RedmineError("REDMINE_TIMEOUT", 0, url, "15s exceeded after 3 attempts");
        }
        lastErr = e;
        if (attempt === MAX_ATTEMPTS) throw e;
      }
    }
    throw lastErr;
  }
}

function backoffMs(attempt: number) {
  return [250, 1000, 4000][attempt - 1] ?? 4000;
}
function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
