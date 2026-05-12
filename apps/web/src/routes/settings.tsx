import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useHealth } from "@/api/queries";

function SettingsPage() {
  const q = useHealth();
  if (!q.data) return <div className="h-40 rounded-2xl bg-card animate-pulse" />;
  const tone: "default" | "destructive" | "secondary" =
    q.data.redmine === "ok"
      ? "default"
      : q.data.redmine === "auth_failed" || q.data.redmine === "rest_disabled"
        ? "destructive"
        : "secondary";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="text-sm uppercase tracking-wider text-muted-foreground">
            Redmine connection
          </div>
          <div className="flex items-center gap-2">
            Status: <Badge variant={tone}>{q.data.redmine}</Badge>
          </div>
          {q.data.errors.length > 0 && (
            <div className="text-sm text-destructive">
              {q.data.errors.map((e) => (
                <div key={e.code}>
                  {e.code}: {e.message}
                </div>
              ))}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            Last sync: {q.data.lastSync ?? "never"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/settings")({ component: SettingsPage });
