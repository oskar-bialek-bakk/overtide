import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunSync } from "@/api/mutations";
import { cn } from "@/lib/utils";

export function SyncButton() {
  const m = useRunSync();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={m.isPending}
      onClick={() => m.mutate()}
      className="gap-2"
    >
      <RefreshCw size={14} className={cn(m.isPending && "animate-spin")} />
      {m.isPending ? "Syncing…" : "Sync"}
    </Button>
  );
}
