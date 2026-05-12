// Shared Recharts <Tooltip /> styling — white pill on dark theme so it
// actually stands out from the dark card background.
export const chartTooltipProps = {
  contentStyle: {
    background: "hsl(0 0% 96%)",
    color: "hsl(240 10% 8%)",
    border: "none",
    borderRadius: 10,
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
    fontSize: 12,
    padding: "6px 10px",
  },
  labelStyle: {
    color: "hsl(240 10% 8%)",
    fontWeight: 600,
    marginBottom: 2,
  },
  itemStyle: {
    color: "hsl(240 10% 8%)",
    padding: 0,
  },
  cursor: { fill: "hsl(0 0% 100% / 0.05)" },
} as const;
