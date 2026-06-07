import type { issues as IssuesTable, timeEntries as TETable } from "../db/schema";
import type { RedmineIssue, RedmineTimeEntry } from "../redmine/types";

type IssueRow = typeof IssuesTable.$inferInsert;
type TimeEntryRow = typeof TETable.$inferInsert;

export function normalizeIssue(
  i: RedmineIssue,
  role: "earning" | "redemption",
  redmineBaseUrl: string,
): IssueRow {
  return {
    id: i.id,
    role,
    trackerId: i.tracker.id,
    trackerName: i.tracker.name,
    projectId: i.project.id,
    projectName: i.project.name,
    subject: i.subject,
    statusName: i.status.name,
    isClosed: i.status.is_closed ?? false,
    authorId: i.author?.id ?? null,
    assignedToId: i.assigned_to?.id ?? null,
    createdOn: i.created_on,
    updatedOn: i.updated_on,
    startDate: i.start_date ?? null,
    dueDate: i.due_date ?? null,
    url: `${redmineBaseUrl.replace(/\/$/, "")}/issues/${i.id}`,
    rawJson: JSON.stringify(i),
  };
}

export function normalizeTimeEntry(t: RedmineTimeEntry): TimeEntryRow {
  return {
    id: t.id,
    issueId: t.issue.id,
    userId: t.user.id,
    hours: t.hours,
    activityId: t.activity.id,
    activityName: t.activity.name,
    spentOn: t.spent_on,
    comments: t.comments ?? null,
    createdOn: t.created_on,
    updatedOn: t.updated_on,
  };
}
