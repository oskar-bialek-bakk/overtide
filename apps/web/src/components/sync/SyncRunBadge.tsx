import { useHealth } from "@/api/queries";
import { Link } from "@tanstack/react-router";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SyncRunBadge() {
  const q = useHealth();
  return (
    <Link
      to="/sync"
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      sync: {relativeTime(q.data?.lastSync ?? null)}
    </Link>
  );
}
