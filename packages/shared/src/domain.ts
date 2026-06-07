import { z } from "zod";

export const issueRoleSchema = z.enum(["earning", "redemption"]);
export type IssueRole = z.infer<typeof issueRoleSchema>;

export const issueSchema = z.object({
  id: z.number().int().positive(),
  role: issueRoleSchema,
  subject: z.string(),
  projectName: z.string(),
  trackerName: z.string(),
  statusName: z.string(),
  isClosed: z.boolean(),
  createdOn: z.string(),
  updatedOn: z.string(),
  anchorDate: z.string(),
  url: z.string().url(),
});
export type Issue = z.infer<typeof issueSchema>;

export const earningIssueSchema = issueSchema.extend({
  earned: z.number().nonnegative(),
  consumed: z.number().nonnegative(),
  remaining: z.number(),
});
export type EarningIssue = z.infer<typeof earningIssueSchema>;

export const redemptionIssueSchema = issueSchema.extend({
  requested: z.number().nonnegative(),
  covered: z.number().nonnegative(),
  unlinked: z.number().nonnegative(),
  linkedEarningIds: z.array(z.number().int().positive()),
});
export type RedemptionIssue = z.infer<typeof redemptionIssueSchema>;

export const balanceSchema = z.object({
  earned: z.number(),
  redeemed: z.number(),
  available: z.number(),
  unlinkedHours: z.number(),
});
export type Balance = z.infer<typeof balanceSchema>;

export const healthDataSchema = z.object({
  redmine: z.enum(["ok", "unreachable", "auth_failed", "rest_disabled"]),
  db: z.literal("ok"),
  lastSync: z.string().nullable(),
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
    }),
  ),
});
export type HealthData = z.infer<typeof healthDataSchema>;

export const timelinePointSchema = z.object({
  date: z.string(),
  earned: z.number(),
  redeemed: z.number(),
  cumulative: z.number(),
});
export type TimelinePoint = z.infer<typeof timelinePointSchema>;

export const allocationSchema = z.object({
  earningId: z.number().int().positive(),
  redemptionId: z.number().int().positive(),
  hours: z.number().positive(),
});
export type Allocation = z.infer<typeof allocationSchema>;

export const syncRunSchema = z.object({
  id: z.number(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(["running", "success", "failed"]),
  issuesUpserted: z.number(),
  timeEntriesUpserted: z.number(),
  relationsUpserted: z.number(),
  relationsSkippedUnknownIssue: z.number(),
  relationsSkippedSameRole: z.number(),
  overtimeOnRedemptionIgnored: z.number(),
  errorMessage: z.string().nullable(),
});
export type SyncRun = z.infer<typeof syncRunSchema>;

export const syncStatusSchema = z.object({
  lastRun: syncRunSchema.nullable(),
  stale: z.boolean(),
});
export type SyncStatus = z.infer<typeof syncStatusSchema>;

export const issueDetailIssueSchema = z.object({
  id: z.number().int().positive(),
  role: issueRoleSchema,
  trackerId: z.number().int(),
  trackerName: z.string(),
  projectId: z.number().int(),
  projectName: z.string(),
  subject: z.string(),
  statusName: z.string(),
  isClosed: z.boolean(),
  authorId: z.number().int().nullable(),
  assignedToId: z.number().int().nullable(),
  createdOn: z.string(),
  updatedOn: z.string(),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  url: z.string().url(),
  rawJson: z.string(),
});
export type IssueDetailIssue = z.infer<typeof issueDetailIssueSchema>;

export const timeEntrySchema = z.object({
  id: z.number().int().positive(),
  issueId: z.number().int().positive(),
  userId: z.number().int(),
  hours: z.number(),
  activityId: z.number().int(),
  activityName: z.string(),
  spentOn: z.string(),
  comments: z.string().nullable(),
  createdOn: z.string(),
  updatedOn: z.string(),
});
export type TimeEntry = z.infer<typeof timeEntrySchema>;

export const issueRelationSchema = z.object({
  id: z.number().int().positive(),
  issueFromId: z.number().int().positive(),
  issueToId: z.number().int().positive(),
  relationType: z.string(),
  createdLocally: z.boolean(),
  mirroredAt: z.string(),
  allocatedHours: z.number().nullable(),
});
export type IssueRelation = z.infer<typeof issueRelationSchema>;

export const issueDetailSchema = z.object({
  issue: issueDetailIssueSchema,
  timeEntries: z.array(timeEntrySchema),
  relations: z.array(issueRelationSchema),
});
export type IssueDetail = z.infer<typeof issueDetailSchema>;
