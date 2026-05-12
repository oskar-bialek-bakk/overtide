import { describe, expect, it } from "bun:test";
import { loadEnv } from "./env";

const minimal = {
  REDMINE_URL: "https://r.example.com",
  REDMINE_TRACKER_REDEMPTION_ID: "12",
  REDMINE_ACTIVITY_OVERTIME_ID: "8",
};

describe("loadEnv", () => {
  it("prefers API key when both auth methods set", () => {
    const e = loadEnv({ ...minimal, REDMINE_API_KEY: "abc", REDMINE_USERNAME: "u", REDMINE_PASSWORD: "p" });
    expect(e.auth.kind).toBe("apiKey");
  });

  it("falls back to basic auth", () => {
    const e = loadEnv({ ...minimal, REDMINE_USERNAME: "u", REDMINE_PASSWORD: "p" });
    expect(e.auth).toEqual({ kind: "basic", username: "u", password: "p" });
  });

  it("throws AUTH_NOT_CONFIGURED when neither is set", () => {
    expect(() => loadEnv(minimal)).toThrow(/AUTH_NOT_CONFIGURED/);
  });

  it("coerces numeric ids", () => {
    const e = loadEnv({ ...minimal, REDMINE_USERNAME: "u", REDMINE_PASSWORD: "p" });
    expect(e.redemptionTrackerId).toBe(12);
    expect(e.overtimeActivityId).toBe(8);
  });

  it("rejects invalid URL", () => {
    expect(() => loadEnv({ ...minimal, REDMINE_URL: "not-a-url", REDMINE_USERNAME: "u", REDMINE_PASSWORD: "p" })).toThrow();
  });

  it("accepts a valid REDMINE_SYNC_FROM date", () => {
    const e = loadEnv({
      ...minimal,
      REDMINE_USERNAME: "u",
      REDMINE_PASSWORD: "p",
      REDMINE_SYNC_FROM: "2026-01-01",
    });
    expect(e.syncFrom).toBe("2026-01-01");
  });

  it("rejects malformed REDMINE_SYNC_FROM", () => {
    expect(() =>
      loadEnv({
        ...minimal,
        REDMINE_USERNAME: "u",
        REDMINE_PASSWORD: "p",
        REDMINE_SYNC_FROM: "01-2026",
      }),
    ).toThrow(/REDMINE_SYNC_FROM/);
  });

  it("omits syncFrom when not set", () => {
    const e = loadEnv({ ...minimal, REDMINE_USERNAME: "u", REDMINE_PASSWORD: "p" });
    expect(e.syncFrom).toBeUndefined();
  });
});
