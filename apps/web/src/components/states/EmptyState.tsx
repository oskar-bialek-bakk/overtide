import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-12 flex flex-col items-center gap-2 text-center">
      <Inbox size={28} className="text-muted-foreground" />
      <div className="font-medium">{title}</div>
      {description && <div className="text-sm text-muted-foreground">{description}</div>}
    </div>
  );
}
