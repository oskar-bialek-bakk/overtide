import type { RedmineIssue } from "../redmine/types";

export function classifyIssue(
  issue: RedmineIssue,
  timeEntries: Array<{ activity: { id: number } }>,
  cfg: { redemptionTrackerId: number; overtimeActivityId: number },
): "earning" | "redemption" | null {
  if (issue.tracker.id === cfg.redemptionTrackerId) return "redemption";
  if (timeEntries.some((t) => t.activity.id === cfg.overtimeActivityId)) return "earning";
  return null;
}
