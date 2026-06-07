import { useEarning } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateShort, hours } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

export function EarningTable() {
  const q = useEarning();
  if (!q.data) return <div className="h-40 rounded-2xl bg-card animate-pulse" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Issue</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Anchor</TableHead>
          <TableHead className="text-right">Earned</TableHead>
          <TableHead className="text-right">Consumed</TableHead>
          <TableHead className="text-right">Remaining</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {q.data.map((e) => (
          <TableRow key={e.id} className="hover:bg-secondary/40">
            <TableCell>
              <Link to="/issue/$id" params={{ id: String(e.id) }} className="hover:underline">
                #{e.id} {e.subject}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{e.projectName}</TableCell>
            <TableCell className="text-muted-foreground">{dateShort(e.anchorDate)}</TableCell>
            <TableCell className="text-right tabular-nums">{hours(e.earned)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {hours(e.consumed)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-medium">
              {e.remaining > 0.001 ? (
                <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
                  {hours(e.remaining)}
                </Badge>
              ) : (
                <span className="text-muted-foreground">{hours(e.remaining)}</span>
              )}
            </TableCell>
            <TableCell>
              <a
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Open #${e.id} in Redmine`}
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
