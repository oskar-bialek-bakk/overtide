import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTimeline } from "@/api/queries";
import { chartTooltipProps } from "@/components/charts/tooltip";

const dayShort = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export function TimelineChart() {
  const q = useTimeline();
  if (!q.data) return <div className="h-96 rounded-2xl bg-card animate-pulse" />;
  if (q.data.length === 0)
    return <div className="text-sm text-muted-foreground">No data yet — run a sync.</div>;

  const lastPoint = q.data[q.data.length - 1];
  const max = q.data.reduce((m, p) => Math.max(m, p.cumulative, p.earned, p.redeemed), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Running balance — area shows cumulative available hours over time;
          bars show daily earned (green) and redeemed (red) activity.
        </div>
        <div className="text-sm tabular-nums">
          latest:{" "}
          <span className="font-medium">
            {lastPoint?.cumulative.toFixed(1) ?? "0.0"}h
          </span>
        </div>
      </div>
      <div className="h-96 rounded-2xl border border-border/60 bg-card/40 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={q.data} margin={{ top: 10, right: 12, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="hsl(var(--border))"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickFormatter={dayShort}
              minTickGap={24}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              domain={[0, Math.ceil(max * 1.1)]}
              width={36}
            />
            <Tooltip
              {...chartTooltipProps}
              labelFormatter={(d) => dayShort(d as string)}
              formatter={(v: number, k) => [`${v.toFixed(1)}h`, k]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="cumulative"
              name="Balance"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#cumFill)"
            />
            <Bar dataKey="earned" name="Earned" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            <Bar
              dataKey="redeemed"
              name="Redeemed"
              fill="hsl(var(--destructive))"
              radius={[3, 3, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
