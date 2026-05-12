import { createFileRoute } from "@tanstack/react-router";
import { IssueDetailPanel } from "@/components/issues/IssueDetailPanel";
import { EmptyState } from "@/components/states/EmptyState";

export const Route = createFileRoute("/issue/$id")({
  component: () => {
    const { id } = Route.useParams();
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return (
        <EmptyState
          title="Issue not found"
          description={`"${id}" is not a valid issue id.`}
        />
      );
    }
    return <IssueDetailPanel id={numericId} />;
  },
});
