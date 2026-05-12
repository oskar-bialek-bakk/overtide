import { CircleAlert, CircleCheck } from "lucide-react";
import { useBalance } from "@/api/queries";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/balance/AnimatedNumber";

export function BalancePill() {
  const q = useBalance();
  if (!q.data) return <div className="h-8 w-28 rounded-full bg-secondary animate-pulse" />;
  const v = q.data.available;
  const tone: "primary" | "amber" | "destructive" =
    v < 0 ? "destructive" : v < 8 ? "amber" : "primary";
  return (
    <div
      className={cn(
        "h-8 px-3 inline-flex items-center gap-2 rounded-full text-sm font-medium",
        tone === "primary" && "bg-primary/15 text-primary",
        tone === "amber" && "bg-amber-500/15 text-amber-400",
        tone === "destructive" && "bg-destructive/15 text-destructive",
      )}
    >
      {tone === "destructive" ? <CircleAlert size={14} /> : <CircleCheck size={14} />}
      <span>
        <AnimatedNumber value={v} />h
      </span>
    </div>
  );
}
