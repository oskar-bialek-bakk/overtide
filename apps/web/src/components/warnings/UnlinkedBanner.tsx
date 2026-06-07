import { useUnlinked } from "@/api/queries";
import { hours } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function UnlinkedBanner() {
  const q = useUnlinked();
  const data = q.data ?? [];
  const count = data.length;
  if (count === 0) return null;
  const totalUnlinked = data.reduce((s, r) => s + r.unlinked, 0);
  return (
    <Link to="/unlinked" className="block">
      <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
        <TriangleAlert className="text-amber-400" size={18} />
        <span>
          <strong>{count}</strong> redemption{count > 1 ? "s" : ""} without overtime links (
          {hours(totalUnlinked)})
        </span>
        <span className="ml-auto text-amber-400 hover:underline">Resolve →</span>
      </div>
    </Link>
  );
}
