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
  errorMessage: z.string().nullable(),
});
export type SyncRun = z.infer<typeof syncRunSchema>;
