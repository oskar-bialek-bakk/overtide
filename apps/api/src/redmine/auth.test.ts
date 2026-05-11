import { describe, expect, it } from "bun:test";
import type { Env } from "../config/env";
import { buildAuthHeaders } from "./auth";

const base = { redmineUrl: "x", redemptionTrackerId: 1, overtimeActivityId: 1, port: 1, logLevel: "info" };

describe("buildAuthHeaders", () => {
  it("emits X-Redmine-API-Key when apiKey auth", () => {
    const env: Env = { ...base, auth: { kind: "apiKey", apiKey: "abc" } };
    expect(buildAuthHeaders(env)).toEqual({ "X-Redmine-API-Key": "abc" });
  });

  it("emits Basic auth when basic", () => {
    const env: Env = { ...base, auth: { kind: "basic", username: "u", password: "p" } };
    const expected = `Basic ${Buffer.from("u:p").toString("base64")}`;
    expect(buildAuthHeaders(env)).toEqual({ Authorization: expected });
  });
});
