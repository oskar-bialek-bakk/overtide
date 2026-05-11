import { describe, expect, it } from "bun:test";
import type { RedmineIssue } from "../redmine/types";
import { classifyIssue } from "./classify";

const make = (trackerId: number): RedmineIssue => ({
  id: 1,
  project: { id: 1, name: "P" },
  tracker: { id: trackerId, name: "T" },
  status: { id: 1, name: "Open" },
  subject: "S",
  created_on: "2026-01-01T00:00:00Z",
  updated_on: "2026-01-02T00:00:00Z",
});

describe("classifyIssue", () => {
  const cfg = { redemptionTrackerId: 12, overtimeActivityId: 8 };

  it("returns 'redemption' when tracker matches", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test fixture cast
    expect(classifyIssue(make(12), [{ activity: { id: 8 } } as any], cfg)).toBe("redemption");
  });

  it("returns 'earning' when any time entry has overtime activity", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test fixture cast
    expect(classifyIssue(make(5), [{ activity: { id: 8 } } as any], cfg)).toBe("earning");
  });

  it("returns null when no overtime entries and not redemption", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test fixture cast
    expect(classifyIssue(make(5), [{ activity: { id: 99 } } as any], cfg)).toBeNull();
  });

  it("redemption tracker wins even when entries have overtime activity (with warning expected at caller)", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test fixture cast
    expect(classifyIssue(make(12), [{ activity: { id: 8 } } as any], cfg)).toBe("redemption");
  });
});
