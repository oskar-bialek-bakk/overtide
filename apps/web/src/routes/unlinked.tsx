import { useUnlinked } from "@/api/queries";
import { RelationLinker } from "@/components/linker/RelationLinker";
import { EmptyState } from "@/components/states/EmptyState";
import { Button } from "@/components/ui/button";
import { dateShort, hours } from "@/lib/format";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

function UnlinkedPage() {
  const q = useUnlinked();
  const [target, setTarget] = useState<{
    id: number;
    subject: string;
    unlinked: number;
  } | null>(null);
  if (!q.data) return <div className="h-40 rounded-2xl bg-card animate-pulse" />;
  if (q.data.length === 0) {
    return (
      <EmptyState
        title="Everything is linked"
        description="No redemptions are missing overtime links."
      />
    );
  }
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Unlinked redemptions</h1>
      {q.data.map((r) => (
        <div
          key={r.id}
          className="rounded-2xl border border-border/60 bg-card/40 px-4 py-3 flex items-center justify-between"
        >
          <div>
            <div className="font-medium">
              #{r.id} {r.subject}
            </div>
            <div className="text-xs text-muted-foreground">
              {r.projectName} · {dateShort(r.anchorDate)} · needs {hours(r.unlinked)}
            </div>
          </div>
          <Button onClick={() => setTarget({ id: r.id, subject: r.subject, unlinked: r.unlinked })}>
            Pick earning to link
          </Button>
        </div>
      ))}
      {target && (
        <RelationLinker
          open
          onOpenChange={(v) => !v && setTarget(null)}
          redemptionId={target.id}
          redemptionSubject={target.subject}
          unlinkedHours={target.unlinked}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute("/unlinked")({ component: UnlinkedPage });
