import { useSyncHistory, useSyncStatus } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SyncRun } from "@overtide/shared";
import { createFileRoute } from "@tanstack/react-router";

function SyncPage() {
  const history = useSyncHistory();
  const status = useSyncStatus();
  if (!history.data || !status.data)
    return <div className="h-40 rounded-2xl bg-card animate-pulse" />;

  const lastRun = status.data.lastRun;
  const skippedCount = lastRun ? totalSkipped(lastRun) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Sync history</h1>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Current status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {lastRun ? (
            <>
              <SyncStatusBadge run={lastRun} />
              {status.data.stale && <Badge variant="destructive">stale</Badge>}
              <span className="text-sm text-muted-foreground">
                Last finished{" "}
                {lastRun.finishedAt ? new Date(lastRun.finishedAt).toLocaleString() : "never"}
              </span>
              {skippedCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  Skipped {skippedCount}: {skippedSummary(lastRun)}
                </span>
              )}
            </>
          ) : (
            <>
              <Badge variant="destructive">stale</Badge>
              <span className="text-sm text-muted-foreground">No sync runs recorded</span>
            </>
          )}
        </CardContent>
      </Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Issues</TableHead>
            <TableHead className="text-right">Time entries</TableHead>
            <TableHead className="text-right">Relations</TableHead>
            <TableHead>Skipped</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.data.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-muted-foreground tabular-nums">
                {new Date(r.startedAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <SyncStatusBadge run={r} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.issuesUpserted}</TableCell>
              <TableCell className="text-right tabular-nums">{r.timeEntriesUpserted}</TableCell>
              <TableCell className="text-right tabular-nums">{r.relationsUpserted}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {totalSkipped(r) > 0 ? skippedSummary(r) : "-"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                {r.errorMessage ?? "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SyncStatusBadge({ run }: { run: SyncRun }) {
  return (
    <Badge
      variant={
        run.status === "success" ? "default" : run.status === "failed" ? "destructive" : "secondary"
      }
    >
      {run.status}
    </Badge>
  );
}

function totalSkipped(run: SyncRun) {
  return (
    run.relationsSkippedUnknownIssue +
    run.relationsSkippedSameRole +
    run.overtimeOnRedemptionIgnored
  );
}

function skippedSummary(run: SyncRun) {
  return [
    run.relationsSkippedUnknownIssue > 0 ? `${run.relationsSkippedUnknownIssue} unknown` : null,
    run.relationsSkippedSameRole > 0 ? `${run.relationsSkippedSameRole} same-role` : null,
    run.overtimeOnRedemptionIgnored > 0 ? `${run.overtimeOnRedemptionIgnored} overtime` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export const Route = createFileRoute("/sync")({ component: SyncPage });
