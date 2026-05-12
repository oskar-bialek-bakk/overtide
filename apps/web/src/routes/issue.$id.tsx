import { createFileRoute } from "@tanstack/react-router";
import { IssueDetailPanel } from "@/components/issues/IssueDetailPanel";

export const Route = createFileRoute("/issue/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <IssueDetailPanel id={Number(id)} />;
  },
});
