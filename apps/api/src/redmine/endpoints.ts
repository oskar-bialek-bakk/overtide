import { RedmineClient } from "./client";
import {
  activitiesResponseSchema, issuesResponseSchema, timeEntriesResponseSchema,
  trackersResponseSchema, usersCurrentResponseSchema, type RedmineIssue, type RedmineTimeEntry,
} from "./types";

export class RedmineEndpoints {
  constructor(private c: RedmineClient) {}

  async currentUserId(): Promise<number> {
    const raw = await this.c.get("/users/current.json");
    return usersCurrentResponseSchema.parse(raw).user.id;
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
      user_id: opts.userId, limit: opts.limit ?? 100, offset: opts.offset ?? 0, from: opts.from,
    });
    return timeEntriesResponseSchema.parse(raw);
  }

  async *iterAllTimeEntries(opts: { userId: number; from?: string }): AsyncIterable<RedmineTimeEntry> {
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
        issue_id: chunk.join(","), status_id: "*", include: "relations", limit: 100,
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
}
