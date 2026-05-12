import { motion } from "framer-motion";
import { useBalance } from "@/api/queries";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/balance/AnimatedNumber";
import { hours } from "@/lib/format";

export function BalanceCard() {
  const q = useBalance();
  if (!q.data) return <Card className="h-40 animate-pulse" />;
  const { earned, redeemed, available } = q.data;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="rounded-2xl bg-card/60 backdrop-blur border border-border/60">
        <CardContent className="p-6">
          <div className="text-sm uppercase tracking-wider text-muted-foreground">Available</div>
          <div className="mt-2 text-5xl font-semibold tabular-nums">
            <AnimatedNumber value={available} />h
          </div>
          <div className="mt-6 flex items-center gap-8 text-sm text-muted-foreground">
            <div>
              <span className="text-foreground font-medium">{hours(earned)}</span> earned
            </div>
            <div>
              <span className="text-foreground font-medium">{hours(redeemed)}</span> redeemed
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
