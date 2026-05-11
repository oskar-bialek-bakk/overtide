import { sql, eq } from "drizzle-orm";
import type { Db } from "./client";
import { issues, issueRelations, timeEntries } from "./schema";

export type EarningRow = {
  id: number; subject: string; projectName: string; trackerName: string; statusName: string;
  isClosed: boolean; createdOn: string; updatedOn: string; url: string;
  earned: number; anchorDate: string;
};

export type RedemptionRow = {
  id: number; subject: string; projectName: string; trackerName: string; statusName: string;
  isClosed: boolean; createdOn: string; updatedOn: string; url: string;
  requested: number; anchorDate: string;
};

export async function fetchEarnings(db: Db, overtimeActivityId: number): Promise<EarningRow[]> {
  const result = db.all<any>(sql`
    SELECT i.id, i.subject, i.project_name AS projectName, i.tracker_name AS trackerName,
           i.status_name AS statusName, i.is_closed AS isClosed, i.created_on AS createdOn,
           i.updated_on AS updatedOn, i.url,
           COALESCE(SUM(CASE WHEN te.activity_id = ${overtimeActivityId} THEN te.hours ELSE 0 END), 0) AS earned,
           COALESCE(MIN(te.spent_on), DATE(i.created_on)) AS anchorDate
    FROM issues i
    LEFT JOIN time_entries te ON te.issue_id = i.id
    WHERE i.role = 'earning'
    GROUP BY i.id
  `);
  return (result as any[]).map((r) => ({ ...r, isClosed: Boolean(r.isClosed) }));
}

export async function fetchRedemptions(db: Db): Promise<RedemptionRow[]> {
  const result = db.all<any>(sql`
    SELECT i.id, i.subject, i.project_name AS projectName, i.tracker_name AS trackerName,
           i.status_name AS statusName, i.is_closed AS isClosed, i.created_on AS createdOn,
           i.updated_on AS updatedOn, i.url,
           COALESCE(SUM(te.hours), 0) AS requested,
           COALESCE(MIN(te.spent_on), DATE(i.created_on)) AS anchorDate
    FROM issues i
    LEFT JOIN time_entries te ON te.issue_id = i.id
    WHERE i.role = 'redemption'
    GROUP BY i.id
  `);
  return (result as any[]).map((r) => ({ ...r, isClosed: Boolean(r.isClosed) }));
}

export async function fetchRelations(db: Db): Promise<Array<{ earningId: number; redemptionId: number }>> {
  const rows = await db.select().from(issueRelations);
  const out: Array<{ earningId: number; redemptionId: number }> = [];
  const ids = new Set(rows.flatMap((r) => [r.issueFromId, r.issueToId]));
  if (ids.size === 0) return out;
  const issueRows = await db.select().from(issues);
  const roleById = new Map(issueRows.map((i) => [i.id, i.role]));
  for (const r of rows) {
    if (r.relationType !== "relates") continue;
    const fromRole = roleById.get(r.issueFromId);
    const toRole = roleById.get(r.issueToId);
    if (fromRole === "earning" && toRole === "redemption") {
      out.push({ earningId: r.issueFromId, redemptionId: r.issueToId });
    } else if (fromRole === "redemption" && toRole === "earning") {
      out.push({ earningId: r.issueToId, redemptionId: r.issueFromId });
    }
  }
  return out;
}
