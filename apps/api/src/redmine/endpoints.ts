import type { RedmineClient } from "./client";
import {
  type RedmineIssue,
  type RedmineTimeEntry,
  activitiesResponseSchema,
  issueResponseSchema,
  issuesResponseSchema,
  timeEntriesResponseSchema,
  timeEntryResponseSchema,
  trackersResponseSchema,
  usersCurrentResponseSchema,
} from "./types";

export type CreateIssueInput = {
  projectId: number;
  trackerId: number;
  subject: string;
  description?: string;
  assignedToId?: number;
  startDate: string;
  dueDate: string;
};

export type CreateTimeEntryInput = {
  issueId: number;
  hours: number;
  activityId: number;
  spentOn: string;
  comments?: string;
};

export type CurrentUser = {
  id: number;
  login?: string | undefined;
  firstname?: string | undefined;
  lastname?: string | undefined;
  mail?: string | undefined;
};

export class RedmineEndpoints {
  constructor(private c: RedmineClient) {}

  async currentUserId(): Promise<number> {
    const raw = await this.c.get("/users/current.json");
    return usersCurrentResponseSchema.parse(raw).user.id;
  }

  async currentUser(): Promise<CurrentUser> {
    const raw = await this.c.get("/users/current.json");
    return usersCurrentResponseSchema.parse(raw).user;
  }

  async trackers() {
    const raw = await this.c.get("/trackers.json");
    return trackersResponseSchema.parse(raw).trackers;
  }

  async activities() {
    const raw = await this.c.get("/enumerations/time_entry_activities.json");
    return activitiesResponseSchema.parse(raw).time_entry_activities;
  }

  async timeEntries(opts: { userId: number; from?: string; limit?: number; offset?: number }) {
    const raw = await this.c.get("/time_entries.json", {
      user_id: opts.userId,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
      from: opts.from,
    });
    return timeEntriesResponseSchema.parse(raw);
  }

  async *iterAllTimeEntries(opts: {
    userId: number;
    from?: string;
  }): AsyncIterable<RedmineTimeEntry> {
    let offset = 0;
    const limit = 100;
    while (true) {
      const page = await this.timeEntries({ ...opts, offset, limit });
      for (const e of page.time_entries) yield e;
      if (page.time_entries.length < limit) return;
      offset += limit;
    }
  }

  async issuesByIds(ids: number[]): Promise<RedmineIssue[]> {
    if (ids.length === 0) return [];
    const out: RedmineIssue[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const raw = await this.c.get("/issues.json", {
        issue_id: chunk.join(","),
        status_id: "*",
        include: "relations",
        limit: 100,
      });
      out.push(...issuesResponseSchema.parse(raw).issues);
    }
    return out;
  }

  async createRelation(fromId: number, toId: number, type = "relates"): Promise<{ id: number }> {
    const raw = await this.c.post(`/issues/${fromId}/relations.json`, {
      relation: { issue_to_id: toId, relation_type: type },
    });
    const parsed = (raw as { relation: { id: number } }).relation;
    return { id: parsed.id };
  }

  async deleteRelation(id: number): Promise<void> {
    await this.c.delete(`/relations/${id}.json`);
  }

  async createIssue(input: CreateIssueInput): Promise<RedmineIssue> {
    const raw = await this.c.post("/issues.json", {
      issue: {
        project_id: input.projectId,
        tracker_id: input.trackerId,
        subject: input.subject,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.assignedToId !== undefined ? { assigned_to_id: input.assignedToId } : {}),
        start_date: input.startDate,
        due_date: input.dueDate,
      },
    });
    return issueResponseSchema.parse(raw).issue;
  }

  async createTimeEntry(input: CreateTimeEntryInput): Promise<RedmineTimeEntry> {
    const raw = await this.c.post("/time_entries.json", {
      time_entry: {
        issue_id: input.issueId,
        hours: input.hours,
        activity_id: input.activityId,
        spent_on: input.spentOn,
        ...(input.comments !== undefined ? { comments: input.comments } : {}),
      },
    });
    return timeEntryResponseSchema.parse(raw).time_entry;
  }
}
