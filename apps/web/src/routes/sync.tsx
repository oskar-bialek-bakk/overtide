import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSyncHistory } from "@/api/queries";

function SyncPage() {
  const q = useSyncHistory();
  if (!q.data) return <div className="h-40 rounded-2xl bg-card animate-pulse" />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Sync history</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Issues</TableHead>
            <TableHead className="text-right">Time entries</TableHead>
            <TableHead className="text-right">Relations</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.data.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-muted-foreground tabular-nums">
                {new Date(r.startedAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    r.status === "success"
                      ? "default"
                      : r.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.issuesUpserted}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.timeEntriesUpserted}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.relationsUpserted}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                {r.errorMessage ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export const Route = createFileRoute("/sync")({ component: SyncPage });
