import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTimeline } from "@/api/queries";

export function TimelineChart() {
  const q = useTimeline();
  if (!q.data) return <div className="h-80 rounded-2xl bg-card animate-pulse" />;
  if (q.data.length === 0)
    return (
      <div className="text-sm text-muted-foreground">No data yet — run a sync.</div>
    );
  return (
    <div className="h-80 rounded-2xl border border-border/60 bg-card/40 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={q.data}>
          <CartesianGrid
            stroke="hsl(var(--border))"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Legend />
          <Bar dataKey="earned" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          <Bar
            dataKey="redeemed"
            fill="hsl(var(--destructive))"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
