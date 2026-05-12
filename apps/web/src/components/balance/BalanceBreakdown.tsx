import { motion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useBalance, useEarning, useUnlinked } from "@/api/queries";
import { Card, CardContent } from "@/components/ui/card";
import { hours } from "@/lib/format";

type Slice = { name: string; value: number; fill: string };

export function BalanceBreakdown() {
  const balance = useBalance();
  const earning = useEarning();
  const unlinked = useUnlinked();

  if (!balance.data || !earning.data || !unlinked.data) {
    return <Card className="h-72 animate-pulse" />;
  }

  const totalEarned = balance.data.earned;
  const totalRedeemed = balance.data.redeemed;
  const totalAvailable = balance.data.available;
  const unlinkedHours = unlinked.data.reduce((s, r) => s + r.unlinked, 0);

  const earningsWithRemaining = earning.data
    .filter((e) => e.remaining > 0.001)
    .sort((a, b) => b.remaining - a.remaining);

  const breakdown: Slice[] = [];
  if (totalRedeemed > 0)
    breakdown.push({ name: "Redeemed", value: totalRedeemed, fill: "hsl(var(--muted-foreground))" });
  if (totalAvailable > 0)
    breakdown.push({ name: "Available", value: totalAvailable, fill: "hsl(var(--primary))" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
    >
      <Card className="rounded-2xl bg-card/60 backdrop-blur border border-border/60">
        <CardContent className="p-6 grid gap-6 md:grid-cols-[1fr_1fr]">
          <div>
            <div className="text-sm uppercase tracking-wider text-muted-foreground mb-2">
              Earned breakdown
            </div>
            <div className="h-44">
              {breakdown.length === 0 ? (
                <div className="h-full grid place-items-center text-sm text-muted-foreground">
                  No data — run a sync.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="value"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    >
                      {breakdown.map((s) => (
                        <Cell key={s.name} fill={s.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                      }}
                      formatter={(value: number) => `${value.toFixed(1)}h`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary" /> Available
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-muted-foreground" /> Redeemed
              </span>
            </div>
          </div>

          <div>
            <div className="text-sm uppercase tracking-wider text-muted-foreground mb-2">
              Top earnings with remaining
            </div>
            {earningsWithRemaining.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Everything is fully redeemed.
              </div>
            ) : (
              <div className="space-y-2">
                {earningsWithRemaining.slice(0, 5).map((e) => {
                  const pct = e.earned > 0 ? Math.round((e.remaining / e.earned) * 100) : 0;
                  return (
                    <div key={e.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">
                          #{e.id} {e.subject}
                        </span>
                        <span className="tabular-nums text-muted-foreground shrink-0 ml-2">
                          {hours(e.remaining)} / {hours(e.earned)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {earningsWithRemaining.length > 5 && (
                  <div className="text-xs text-muted-foreground pt-1">
                    +{earningsWithRemaining.length - 5} more on the Earning page
                  </div>
                )}
              </div>
            )}
            {unlinkedHours > 0 && (
              <div className="mt-4 text-xs text-amber-400">
                {hours(unlinkedHours)} of redemption demand still unlinked.
              </div>
            )}
            <div className="mt-3 text-[11px] text-muted-foreground">
              Earned {hours(totalEarned)} · Redeemed {hours(totalRedeemed)} · Available {hours(totalAvailable)}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
