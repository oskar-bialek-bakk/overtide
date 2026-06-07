import { RedemptionTable } from "@/components/issues/RedemptionTable";
import { CreateRedemptionWizard } from "@/components/redemption-wizard/CreateRedemptionWizard";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

function RedemptionsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Redemption issues</h1>
        <Button onClick={() => setWizardOpen(true)} data-testid="new-redemption-btn">
          <Plus size={14} className="mr-1" /> New redemption
        </Button>
      </div>
      <RedemptionTable />
      <CreateRedemptionWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

export const Route = createFileRoute("/redemptions")({
  component: RedemptionsPage,
});
