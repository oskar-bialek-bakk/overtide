import { eq, inArray, sql } from "drizzle-orm";
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

type EarningSqlRow = Omit<EarningRow, "isClosed"> & { isClosed: number | boolean };
type RedemptionSqlRow = Omit<RedemptionRow, "isClosed"> & { isClosed: number | boolean };

export async function fetchEarnings(db: Db, overtimeActivityId: number): Promise<EarningRow[]> {
  const result = db.all<EarningSqlRow>(sql`
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
  return result.map((r) => ({ ...r, isClosed: Boolean(r.isClosed) }));
}

export async function fetchRedemptions(db: Db): Promise<RedemptionRow[]> {
  const result = db.all<RedemptionSqlRow>(sql`
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
  return result.map((r) => ({ ...r, isClosed: Boolean(r.isClosed) }));
}

export async function fetchRelations(db: Db): Promise<
  Array<{ earningId: number; redemptionId: number; allocatedHours: number | null }>
> {
  // Filter relation_type at the SQL boundary so we don't pull other types into memory.
  const rows = await db
    .select()
    .from(issueRelations)
    .where(eq(issueRelations.relationType, "relates"));
  if (rows.length === 0) return [];

  // Only the issues referenced by these relations are needed for role mapping —
  // avoids a full-table scan on `issues` as the DB grows.
  const idSet = new Set<number>();
  for (const r of rows) {
    idSet.add(r.issueFromId);
    idSet.add(r.issueToId);
  }
  const issueRows = await db
    .select({ id: issues.id, role: issues.role })
    .from(issues)
    .where(inArray(issues.id, [...idSet]));
  const roleById = new Map(issueRows.map((i) => [i.id, i.role]));

  const out: Array<{ earningId: number; redemptionId: number; allocatedHours: number | null }> = [];
  for (const r of rows) {
    const fromRole = roleById.get(r.issueFromId);
    const toRole = roleById.get(r.issueToId);
    if (fromRole === "earning" && toRole === "redemption") {
      out.push({ earningId: r.issueFromId, redemptionId: r.issueToId, allocatedHours: r.allocatedHours });
    } else if (fromRole === "redemption" && toRole === "earning") {
      out.push({ earningId: r.issueToId, redemptionId: r.issueFromId, allocatedHours: r.allocatedHours });
    }
  }
  return out;
}
