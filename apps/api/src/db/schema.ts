import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const issues = sqliteTable(
  "issues",
  {
    id: integer("id").primaryKey(),
    role: text("role", { enum: ["earning", "redemption"] }).notNull(),
    trackerId: integer("tracker_id").notNull(),
    trackerName: text("tracker_name").notNull(),
    projectId: integer("project_id").notNull(),
    projectName: text("project_name").notNull(),
    subject: text("subject").notNull(),
    statusName: text("status_name").notNull(),
    isClosed: integer("is_closed", { mode: "boolean" }).notNull().default(false),
    authorId: integer("author_id"),
    assignedToId: integer("assigned_to_id"),
    createdOn: text("created_on").notNull(),
    updatedOn: text("updated_on").notNull(),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    url: text("url").notNull(),
    rawJson: text("raw_json").notNull(),
  },
  (t) => ({ roleIdx: index("idx_issues_role").on(t.role) }),
);

export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: integer("id").primaryKey(),
    issueId: integer("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    hours: real("hours").notNull(),
    activityId: integer("activity_id").notNull(),
    activityName: text("activity_name").notNull(),
    spentOn: text("spent_on").notNull(),
    comments: text("comments"),
    createdOn: text("created_on").notNull(),
    updatedOn: text("updated_on").notNull(),
  },
  (t) => ({
    issueIdx: index("idx_te_issue").on(t.issueId),
    spentOnIdx: index("idx_te_spent_on").on(t.spentOn),
    activityIdx: index("idx_te_activity").on(t.activityId),
  }),
);

export const issueRelations = sqliteTable(
  "issue_relations",
  {
    id: integer("id").primaryKey(),
    issueFromId: integer("issue_from_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    issueToId: integer("issue_to_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    createdLocally: integer("created_locally", { mode: "boolean" }).notNull().default(false),
    mirroredAt: text("mirrored_at").notNull(),
    // Manual hour override for FIFO. NULL → algorithm allocates greedily as
    // before. Set → that exact amount is locked in for this (earning,
    // redemption) pair, FIFO fills only what's left.
    allocatedHours: real("allocated_hours"),
  },
  (t) => ({
    fromIdx: index("idx_rel_from").on(t.issueFromId),
    toIdx: index("idx_rel_to").on(t.issueToId),
  }),
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status", { enum: ["running", "success", "failed"] }).notNull(),
    issuesUpserted: integer("issues_upserted").notNull().default(0),
    timeEntriesUpserted: integer("time_entries_upserted").notNull().default(0),
    relationsUpserted: integer("relations_upserted").notNull().default(0),
    errorMessage: text("error_message"),
  },
  (t) => ({
    runningGuard: uniqueIndex("uq_sync_running").on(t.status).where(sql`status = 'running'`),
  }),
);

export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
