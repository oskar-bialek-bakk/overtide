import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/issue/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <div>Issue {id} (TBD)</div>;
  },
});
