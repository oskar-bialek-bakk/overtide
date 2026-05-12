import { createFileRoute } from "@tanstack/react-router";
import { RedemptionTable } from "@/components/issues/RedemptionTable";

export const Route = createFileRoute("/redemptions")({
  component: () => (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Redemption issues</h1>
      <RedemptionTable />
    </div>
  ),
});
