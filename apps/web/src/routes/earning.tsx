import { createFileRoute } from "@tanstack/react-router";
import { EarningTable } from "@/components/issues/EarningTable";

export const Route = createFileRoute("/earning")({
  component: () => (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Earning issues</h1>
      <EarningTable />
    </div>
  ),
});
