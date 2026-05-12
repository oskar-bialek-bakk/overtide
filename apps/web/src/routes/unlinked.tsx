import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/unlinked")({
  component: () => <div>Unlinked (TBD)</div>,
});
