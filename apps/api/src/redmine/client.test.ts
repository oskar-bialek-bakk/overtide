import { afterEach, describe, expect, it } from "bun:test";
import { type InstalledClock, install } from "@sinonjs/fake-timers";
import { http, HttpResponse } from "msw";
import { startMsw } from "../../test/helpers/msw";
import { RedmineClient } from "./client";

const env = {
  redmineUrl: "https://r.test",
  auth: { kind: "apiKey" as const, apiKey: "k" },
  redemptionTrackerId: 1,
  overtimeActivityId: 1,
  port: 0,
  logLevel: "info",
};

let server: ReturnType<typeof startMsw> | null = null;
let clock: InstalledClock | null = null;
afterEach(() => {
  server?.close();
  server = null;
  clock?.uninstall();
  clock = null;
});

describe("RedmineClient", () => {
  it("returns parsed JSON on 200", async () => {
    server = startMsw(
      http.get("https://r.test/users/current.json", () => HttpResponse.json({ user: { id: 7 } })),
    );
    const c = new RedmineClient(env);
    const body = await c.get("/users/current.json");
    expect(body).toEqual({ user: { id: 7 } });
  });

  it("retries up to 3 times on 429 then succeeds", async () => {
    clock = install();
    let calls = 0;
    server = startMsw(
      http.get("https://r.test/x.json", () => {
        calls += 1;
        if (calls < 3) return new HttpResponse(null, { status: 429 });
        return HttpResponse.json({ ok: true });
      }),
    );
    const c = new RedmineClient(env);
    const promise = c.get("/x.json");
    await clock.tickAsync(10_000);
    expect(await promise).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("fails fast on 401 with REDMINE_AUTH_FAILED", async () => {
    server = startMsw(
      http.get("https://r.test/x.json", () => new HttpResponse(null, { status: 401 })),
    );
    const c = new RedmineClient(env);
    await expect(c.get("/x.json")).rejects.toMatchObject({ code: "REDMINE_AUTH_FAILED" });
  });
});
