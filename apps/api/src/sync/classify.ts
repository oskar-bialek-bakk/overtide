import type { RedmineIssue, RedmineTimeEntry } from "../redmine/types";

export function classifyIssue(
  issue: RedmineIssue,
  timeEntries: Pick<RedmineTimeEntry, "activity">[],
  cfg: { redemptionTrackerId: number; overtimeActivityId: number },
): "earning" | "redemption" | null {
  if (issue.tracker.id === cfg.redemptionTrackerId) return "redemption";
  if (timeEntries.some((t) => t.activity.id === cfg.overtimeActivityId)) return "earning";
  return null;
}
