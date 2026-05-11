import { z } from "zod";

export const redmineUserSchema = z.object({ id: z.number(), login: z.string().optional() });
export const usersCurrentResponseSchema = z.object({ user: redmineUserSchema });

export const redmineTimeEntrySchema = z.object({
  id: z.number(),
  user: z.object({ id: z.number() }),
  issue: z.object({ id: z.number() }),
  hours: z.number(),
  activity: z.object({ id: z.number(), name: z.string() }),
  spent_on: z.string(),
  comments: z.string().nullable().optional(),
  created_on: z.string(),
  updated_on: z.string(),
});
export const timeEntriesResponseSchema = z.object({
  time_entries: z.array(redmineTimeEntrySchema),
  total_count: z.number(),
  offset: z.number(),
  limit: z.number(),
});

export const redmineRelationSchema = z.object({
  id: z.number(),
  issue_id: z.number(),
  issue_to_id: z.number(),
  relation_type: z.string(),
});

export const redmineIssueSchema = z.object({
  id: z.number(),
  project: z.object({ id: z.number(), name: z.string() }),
  tracker: z.object({ id: z.number(), name: z.string() }),
  status: z.object({ id: z.number(), name: z.string(), is_closed: z.boolean().optional() }),
  author: z.object({ id: z.number() }).optional(),
  assigned_to: z.object({ id: z.number() }).optional(),
  subject: z.string(),
  created_on: z.string(),
  updated_on: z.string(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  relations: z.array(redmineRelationSchema).optional(),
});
export const issuesResponseSchema = z.object({
  issues: z.array(redmineIssueSchema),
  total_count: z.number(),
});

export const trackerSchema = z.object({ id: z.number(), name: z.string() });
export const trackersResponseSchema = z.object({ trackers: z.array(trackerSchema) });

export const activitySchema = z.object({ id: z.number(), name: z.string() });
export const activitiesResponseSchema = z.object({ time_entry_activities: z.array(activitySchema) });

export type RedmineTimeEntry = z.infer<typeof redmineTimeEntrySchema>;
export type RedmineIssue = z.infer<typeof redmineIssueSchema>;
export type RedmineRelation = z.infer<typeof redmineRelationSchema>;
