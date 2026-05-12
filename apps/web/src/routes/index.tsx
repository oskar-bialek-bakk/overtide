import { createFileRoute } from "@tanstack/react-router";
import { BalanceCard } from "@/components/balance/BalanceCard";
import { BalanceBreakdown } from "@/components/balance/BalanceBreakdown";
import { UnlinkedBanner } from "@/components/warnings/UnlinkedBanner";
import { DeficitBanner } from "@/components/warnings/DeficitBanner";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="space-y-6">
      <DeficitBanner />
      <BalanceCard />
      <BalanceBreakdown />
      <UnlinkedBanner />
    </div>
  ),
});
