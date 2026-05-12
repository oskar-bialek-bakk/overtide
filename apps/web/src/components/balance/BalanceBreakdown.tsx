import { motion } from "framer-motion";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "@tanstack/react-router";
import { useBalance, useEarning, useUnlinked } from "@/api/queries";
import { Card, CardContent } from "@/components/ui/card";
import { chartTooltipProps } from "@/components/charts/tooltip";
import { cn } from "@/lib/utils";
import { hours } from "@/lib/format";

type Slice = { name: string; value: number; fill: string };
type View = "remaining" | "all";

export function BalanceBreakdown() {
  const balance = useBalance();
  const earning = useEarning();
  const unlinked = useUnlinked();
  const [view, setView] = useState<View>("remaining");

  if (!balance.data || !earning.data || !unlinked.data) {
    return <Card className="h-72 animate-pulse" />;
  }

  const totalEarned = balance.data.earned;
  const totalRedeemed = balance.data.redeemed;
  const totalAvailable = balance.data.available;
  const unlinkedHours = unlinked.data.reduce((s, r) => s + r.unlinked, 0);

  // Sort: "remaining" view shows biggest leftover first; "all" view shows
  // biggest earner first (so the heavyweights are at the top regardless of
  // whether they still have hours to give).
  const visibleEarnings =
    view === "remaining"
      ? earning.data.filter((e) => e.remaining > 0.001).sort((a, b) => b.remaining - a.remaining)
      : [...earning.data].sort((a, b) => b.earned - a.earned);

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
                      {...chartTooltipProps}
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
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm uppercase tracking-wider text-muted-foreground">
                Earnings
              </div>
              <div
                role="tablist"
                aria-label="Earnings view"
                className="inline-flex h-7 rounded-full bg-secondary p-0.5 text-xs"
              >
                <ViewTab active={view === "remaining"} onClick={() => setView("remaining")}>
                  Remaining
                </ViewTab>
                <ViewTab active={view === "all"} onClick={() => setView("all")}>
                  All
                </ViewTab>
              </div>
            </div>

            {visibleEarnings.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                {view === "remaining" ? "Everything is fully redeemed." : "No earnings yet."}
              </div>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {visibleEarnings.map((e) => {
                  const consumedPct =
                    e.earned > 0 ? Math.min(100, Math.round((e.consumed / e.earned) * 100)) : 0;
                  const remainingPct = 100 - consumedPct;
                  return (
                    <Link
                      key={e.id}
                      to="/issue/$id"
                      params={{ id: String(e.id) }}
                      className="block group"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate group-hover:underline">
                          #{e.id} {e.subject}
                        </span>
                        <span className="tabular-nums text-muted-foreground shrink-0 ml-2">
                          {hours(e.consumed)} / {hours(e.earned)}
                          {e.remaining > 0.001 && (
                            <span className="ml-1.5 text-primary">+{hours(e.remaining)}</span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 flex h-1.5 rounded-full overflow-hidden bg-secondary">
                        <div
                          className="bg-muted-foreground/70"
                          style={{ width: `${consumedPct}%` }}
                          aria-label={`${consumedPct}% redeemed`}
                        />
                        <div
                          className="bg-primary"
                          style={{ width: `${remainingPct}%` }}
                          aria-label={`${remainingPct}% remaining`}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            {unlinkedHours > 0 && (
              <div className="mt-3 text-xs text-amber-400">
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

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "px-2.5 rounded-full transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
