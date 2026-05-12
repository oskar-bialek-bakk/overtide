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

  it("currentUser returns firstname + lastname", async () => {
    server = startMsw(http.get("https://r.test/users/current.json", () =>
      HttpResponse.json({ user: { id: 1039, login: "oskar.bialek", firstname: "Oskar", lastname: "Białek" } })));
    const e = new RedmineEndpoints(new RedmineClient(env));
    const u = await e.currentUser();
    expect(u.id).toBe(1039);
    expect(u.firstname).toBe("Oskar");
    expect(u.lastname).toBe("Białek");
  });

  it("createIssue posts wrapped issue body and parses response", async () => {
    let body: unknown = null;
    server = startMsw(http.post("https://r.test/issues.json", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({
        issue: {
          id: 999,
          project: { id: 12, name: "urlopy" },
          tracker: { id: 19, name: "Odbiór nadgodzin" },
          status: { id: 1, name: "Nowe" },
          subject: "Odbiór nadgodzin OB 12.05",
          start_date: "2026-05-12",
          due_date: "2026-05-12",
          created_on: "2026-05-12T10:00:00Z",
          updated_on: "2026-05-12T10:00:00Z",
        },
      }, { status: 201 });
    }));
    const e = new RedmineEndpoints(new RedmineClient(env));
    const issue = await e.createIssue({
      projectId: 12, trackerId: 19, subject: "Odbiór nadgodzin OB 12.05",
      description: "Odbiór 4h z #114518 (subject)", assignedToId: 1039,
      startDate: "2026-05-12", dueDate: "2026-05-12",
    });
    expect(issue.id).toBe(999);
    expect(body).toEqual({
      issue: {
        project_id: 12, tracker_id: 19, subject: "Odbiór nadgodzin OB 12.05",
        description: "Odbiór 4h z #114518 (subject)", assigned_to_id: 1039,
        start_date: "2026-05-12", due_date: "2026-05-12",
      },
    });
  });

  it("createIssue omits description when not provided", async () => {
    let body: unknown = null;
    server = startMsw(http.post("https://r.test/issues.json", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({
        issue: {
          id: 1, project: { id: 12, name: "urlopy" }, tracker: { id: 19, name: "T" },
          status: { id: 1, name: "Nowe" }, subject: "S", start_date: "2026-05-12", due_date: "2026-05-12",
          created_on: "2026-05-12T10:00:00Z", updated_on: "2026-05-12T10:00:00Z",
        },
      }, { status: 201 });
    }));
    const e = new RedmineEndpoints(new RedmineClient(env));
    await e.createIssue({ projectId: 12, trackerId: 19, subject: "S", startDate: "2026-05-12", dueDate: "2026-05-12" });
    const issueBody = (body as { issue: Record<string, unknown> }).issue;
    expect(issueBody.description).toBeUndefined();
    expect(issueBody.assigned_to_id).toBeUndefined();
  });

  it("createTimeEntry posts wrapped body and parses response", async () => {
    let body: unknown = null;
    server = startMsw(http.post("https://r.test/time_entries.json", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({
        time_entry: {
          id: 500, user: { id: 1039 }, issue: { id: 999 }, hours: 4,
          activity: { id: 8, name: "W biurze" }, spent_on: "2026-05-12",
          comments: "Odbiór 4h z #114518 (X)",
          created_on: "2026-05-12T10:00:00Z", updated_on: "2026-05-12T10:00:00Z",
        },
      }, { status: 201 });
    }));
    const e = new RedmineEndpoints(new RedmineClient(env));
    const te = await e.createTimeEntry({
      issueId: 999, hours: 4, activityId: 8, spentOn: "2026-05-12", comments: "Odbiór 4h z #114518 (X)",
    });
    expect(te.id).toBe(500);
    expect(body).toEqual({
      time_entry: { issue_id: 999, hours: 4, activity_id: 8, spent_on: "2026-05-12", comments: "Odbiór 4h z #114518 (X)" },
    });
  });
});
