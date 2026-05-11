import { afterEach, describe, expect, it } from "bun:test";
import { http, HttpResponse } from "msw";
import { startMsw } from "../../test/helpers/msw";
import { RedmineClient } from "./client";
import { RedmineEndpoints } from "./endpoints";

const env = { redmineUrl: "https://r.test", auth: { kind: "apiKey" as const, apiKey: "k" }, redemptionTrackerId: 1, overtimeActivityId: 1, port: 0, logLevel: "info" };

let server: ReturnType<typeof startMsw> | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

describe("RedmineEndpoints", () => {
  it("currentUserId returns user.id", async () => {
    server = startMsw(http.get("https://r.test/users/current.json", () =>
      HttpResponse.json({ user: { id: 42 } })));
    const e = new RedmineEndpoints(new RedmineClient(env));
    expect(await e.currentUserId()).toBe(42);
  });

  it("issuesByIds chunks ids in groups of 50", async () => {
    const seenChunks: string[] = [];
    server = startMsw(http.get("https://r.test/issues.json", ({ request }) => {
      const url = new URL(request.url);
      seenChunks.push(url.searchParams.get("issue_id") ?? "");
      return HttpResponse.json({ issues: [], total_count: 0 });
    }));
    const e = new RedmineEndpoints(new RedmineClient(env));
    await e.issuesByIds(Array.from({ length: 75 }, (_, i) => i + 1));
    expect(seenChunks).toHaveLength(2);
    expect(seenChunks[0]?.split(",")).toHaveLength(50);
    expect(seenChunks[1]?.split(",")).toHaveLength(25);
  });
});
