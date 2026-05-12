import { Octagon } from "lucide-react";
import { useBalance } from "@/api/queries";
import { hours } from "@/lib/format";

export function DeficitBanner() {
  const q = useBalance();
  if (!q.data || q.data.available >= 0) return null;
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm flex items-center gap-3">
      <Octagon className="text-destructive" size={18} />
      <span>
        Balance below zero: <strong>{hours(q.data.available)}</strong>. Check your Redmine data —
        this should not happen.
      </span>
    </div>
  );
}
