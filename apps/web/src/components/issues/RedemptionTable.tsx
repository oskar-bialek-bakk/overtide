import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRedemption } from "@/api/queries";
import { dateShort, hours } from "@/lib/format";

export function RedemptionTable() {
  const q = useRedemption();
  if (!q.data) return <div className="h-40 rounded-2xl bg-card animate-pulse" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Issue</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Anchor</TableHead>
          <TableHead className="text-right">Requested</TableHead>
          <TableHead className="text-right">Covered</TableHead>
          <TableHead className="text-right">Unlinked</TableHead>
          <TableHead>Linked OT</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {q.data.map((r) => (
          <TableRow key={r.id} className="hover:bg-secondary/40">
            <TableCell>
              <Link
                to="/issue/$id"
                params={{ id: String(r.id) }}
                className="hover:underline"
              >
                #{r.id} {r.subject}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{r.projectName}</TableCell>
            <TableCell className="text-muted-foreground">{dateShort(r.anchorDate)}</TableCell>
            <TableCell className="text-right tabular-nums">{hours(r.requested)}</TableCell>
            <TableCell className="text-right tabular-nums">{hours(r.covered)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {r.unlinked > 0 ? (
                <Badge variant="destructive">{hours(r.unlinked)}</Badge>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {r.linkedEarningIds.length === 0
                ? "—"
                : r.linkedEarningIds.map((id) => `#${id}`).join(", ")}
            </TableCell>
            <TableCell>
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Open #${r.id} in Redmine`}
              >
                <ExternalLink size={14} />
              </a>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
