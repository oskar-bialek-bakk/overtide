import { TimelineChart } from "@/components/timeline/TimelineChart";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/timeline")({
  component: () => (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Timeline</h1>
      <TimelineChart />
    </div>
  ),
});
