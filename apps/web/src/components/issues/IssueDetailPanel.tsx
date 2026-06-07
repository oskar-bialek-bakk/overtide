import { useIssue } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dateShort, hours } from "@/lib/format";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";

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
  const router = useRouter();
  const q = useIssue(id);
  if (!q.data) return <div className="h-40 rounded-2xl bg-card animate-pulse" />;
  const issue = q.data.issue as IssueShape;
  const fallbackTo = issue.role === "earning" ? "/earning" : "/redemptions";
  const timeEntries = q.data.timeEntries as TimeEntryShape[];
  const relations = q.data.relations as RelationShape[];
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={issue.role === "earning" ? "default" : "secondary"}>{issue.role}</Badge>
            <span className="text-sm text-muted-foreground">
              {issue.trackerName} · {issue.projectName}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold">
            #{issue.id} {issue.subject}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // History pop is friendlier when the user came from a list page.
              // If there's nothing to pop (deep link), fall back to the
              // role-appropriate list.
              if (window.history.length > 1) router.history.back();
              else router.navigate({ to: fallbackTo });
            }}
            className="gap-1"
          >
            <ArrowLeft size={14} /> Back
          </Button>
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            Open in Redmine <ExternalLink size={14} />
          </a>
        </div>
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
                <div className="text-muted-foreground tabular-nums">{dateShort(te.spentOn)}</div>
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
              const otherId = r.issueFromId === issue.id ? r.issueToId : r.issueFromId;
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
