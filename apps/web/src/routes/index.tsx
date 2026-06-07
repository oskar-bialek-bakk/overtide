import { BalanceBreakdown } from "@/components/balance/BalanceBreakdown";
import { BalanceCard } from "@/components/balance/BalanceCard";
import { DeficitBanner } from "@/components/warnings/DeficitBanner";
import { UnlinkedBanner } from "@/components/warnings/UnlinkedBanner";
import { createFileRoute } from "@tanstack/react-router";

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
