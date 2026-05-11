import { describe, expect, it } from "bun:test";
import type { RedmineIssue, RedmineTimeEntry } from "../redmine/types";
import { normalizeIssue, normalizeTimeEntry } from "./normalize";

const baseIssue: RedmineIssue = {
  id: 1,
  project: { id: 1, name: "P" },
  tracker: { id: 5, name: "Dev" },
  status: { id: 1, name: "Open", is_closed: false },
  subject: "Hello",
  created_on: "2026-01-01T00:00:00Z",
  updated_on: "2026-01-02T00:00:00Z",
};

describe("normalizeIssue", () => {
  it("maps to DB shape with computed url and rawJson", () => {
    const row = normalizeIssue(baseIssue, "earning", "https://r.test");
    expect(row).toMatchObject({
      id: 1,
      role: "earning",
      trackerName: "Dev",
      projectName: "P",
      subject: "Hello",
      statusName: "Open",
      isClosed: false,
      url: "https://r.test/issues/1",
    });
    expect(JSON.parse(row.rawJson)).toEqual(baseIssue);
  });
});

describe("normalizeTimeEntry", () => {
  it("maps RedmineTimeEntry to DB row", () => {
    const te: RedmineTimeEntry = {
      id: 10,
      user: { id: 7 },
      issue: { id: 1 },
      hours: 2.5,
      activity: { id: 8, name: "Nadgodziny" },
      spent_on: "2026-01-05",
      comments: null,
      created_on: "2026-01-05T00:00:00Z",
      updated_on: "2026-01-05T00:00:00Z",
    };
    expect(normalizeTimeEntry(te)).toMatchObject({
      id: 10,
      issueId: 1,
      userId: 7,
      hours: 2.5,
      activityId: 8,
      activityName: "Nadgodziny",
      spentOn: "2026-01-05",
    });
  });
});
