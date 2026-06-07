import { useBalance } from "@/api/queries";
import { AnimatedNumber } from "@/components/balance/AnimatedNumber";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Hourglass, TrendingDown, TrendingUp } from "lucide-react";

type Tone = "primary" | "muted" | "available";

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: Tone;
  icon: React.ReactNode;
}) {
  const isHero = tone === "available";
  return (
    <div className={cn("flex flex-col gap-2 px-6 py-2", isHero && "md:px-8")}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span
          className={cn(
            "size-7 rounded-full grid place-items-center",
            tone === "available" && "bg-primary/15 text-primary",
            tone === "primary" && "bg-primary/15 text-primary",
            tone === "muted" && "bg-muted-foreground/15 text-muted-foreground",
          )}
        >
          {icon}
        </span>
        {label}
      </div>
      <div
        className={cn(
          "tabular-nums font-semibold",
          isHero ? "text-6xl text-primary" : "text-3xl text-foreground",
        )}
      >
        <AnimatedNumber value={value} />
        <span className={cn("ml-1 font-medium opacity-70", isHero ? "text-3xl" : "text-base")}>
          h
        </span>
      </div>
    </div>
  );
}

export function BalanceCard() {
  const q = useBalance();
  if (!q.data) return <Card className="h-44 animate-pulse" />;
  const { earned, redeemed, available } = q.data;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="rounded-2xl bg-card/60 backdrop-blur border border-border/60">
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border/40">
          <Stat
            label="Available"
            value={available}
            tone="available"
            icon={<Hourglass size={14} />}
          />
          <Stat label="Earned" value={earned} tone="primary" icon={<TrendingUp size={14} />} />
          <Stat label="Redeemed" value={redeemed} tone="muted" icon={<TrendingDown size={14} />} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
