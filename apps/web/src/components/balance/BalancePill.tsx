import { Link } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { useBalance, useUnlinked } from "@/api/queries";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/balance/AnimatedNumber";

type Tone = "green" | "yellow" | "grey" | "destructive";

function pickTone(args: { available: number; unlinkedHours: number }): Tone {
  if (args.available < 0) return "destructive";
  // Yellow always wins over green: an unlinked redemption needs attention
  // even if you also have free overtime sitting around.
  if (args.unlinkedHours > 0) return "yellow";
  if (args.available > 0) return "green";
  return "grey";
}

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-primary/15 text-primary hover:bg-primary/20",
  yellow: "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25",
  grey: "bg-muted text-muted-foreground hover:bg-muted/80",
  destructive: "bg-destructive/15 text-destructive hover:bg-destructive/25",
};

export function BalancePill() {
  const balance = useBalance();
  const unlinked = useUnlinked();

  if (!balance.data) return <div className="h-8 w-28 rounded-full bg-secondary animate-pulse" />;

  const available = balance.data.available;
  const unlinkedHours = (unlinked.data ?? []).reduce((s, r) => s + r.unlinked, 0);
  const tone = pickTone({ available, unlinkedHours });

  return (
    <Link
      to="/earning"
      className={cn(
        "h-8 px-3 inline-flex items-center gap-2 rounded-full text-sm font-medium transition-colors",
        TONE_CLASSES[tone],
      )}
      aria-label={`Available ${available.toFixed(1)}h${unlinkedHours > 0 ? `, ${unlinkedHours.toFixed(1)}h unlinked` : ""}`}
    >
      {tone === "destructive" && <CircleAlert size={14} />}
      {tone === "yellow" && <TriangleAlert size={14} />}
      {tone === "green" && <CircleCheck size={14} />}
      <span>
        <AnimatedNumber value={available} />h
      </span>
    </Link>
  );
}
