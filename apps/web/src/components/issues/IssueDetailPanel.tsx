import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIssue } from "@/api/queries";
import { dateShort, hours } from "@/lib/format";

type IssueShape = {
  id: number;
  role: "earning" | "redemption";
  subject: string;
  projectName: string;
  trackerName: string;
  statusName: string;
  createdOn: string;
  updatedOn: string;
  url: string;
};

type TimeEntryShape = {
  id: number;
  hours: number;
  activityName: string;
  spentOn: string;
  comments: string | null;
};

type RelationShape = {
  id: number;
  issueFromId: number;
  issueToId: number;
  relationType: string;
  createdLocally: boolean;
};

export function IssueDetailPanel({ id }: { id: number }) {
  const q = useIssue(id);
  if (!q.data) return <div className="h-40 rounded-2xl bg-card animate-pulse" />;
  const issue = q.data.issue as IssueShape;
  const timeEntries = q.data.timeEntries as TimeEntryShape[];
  const relations = q.data.relations as RelationShape[];
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={issue.role === "earning" ? "default" : "secondary"}>
              {issue.role}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {issue.trackerName} · {issue.projectName}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold">
            #{issue.id} {issue.subject}
          </h1>
        </div>
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Open in Redmine <ExternalLink size={14} />
        </a>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
            Time entries
          </div>
          <div className="space-y-1.5">
            {timeEntries.length === 0 && (
              <div className="text-sm text-muted-foreground">No time entries yet.</div>
            )}
            {timeEntries.map((te) => (
              <div key={te.id} className="flex items-center justify-between text-sm">
                <div className="text-muted-foreground tabular-nums">
                  {dateShort(te.spentOn)}
                </div>
                <div className="flex-1 px-3 truncate">
                  {te.activityName}
                  {te.comments ? ` — ${te.comments}` : ""}
                </div>
                <div className="tabular-nums">{hours(te.hours)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
            Linked counterparts
          </div>
          <div className="space-y-1.5">
            {relations.length === 0 && (
              <div className="text-sm text-muted-foreground">No relations.</div>
            )}
            {relations.map((r) => {
              const otherId =
                r.issueFromId === issue.id ? r.issueToId : r.issueFromId;
              return (
                <div key={r.id} className="text-sm flex items-center gap-2">
                  <span className="text-muted-foreground">{r.relationType}</span>
                  <Link
                    to="/issue/$id"
                    params={{ id: String(otherId) }}
                    className="hover:underline"
                  >
                    #{otherId}
                  </Link>
                  {r.createdLocally && (
                    <Badge variant="outline" className="text-xs">
                      added by Overtide
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
