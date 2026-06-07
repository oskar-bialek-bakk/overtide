import { useRunSync } from "@/api/mutations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

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
