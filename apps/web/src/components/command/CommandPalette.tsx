import { useRunSync } from "@/api/mutations";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { useEffect, useState } from "react";

const PAGES: ReadonlyArray<readonly [string, string]> = [
  ["/", "Dashboard"],
  ["/earning", "Earning"],
  ["/redemptions", "Redemptions"],
  ["/unlinked", "Unlinked"],
  ["/timeline", "Timeline"],
  ["/sync", "Sync history"],
  ["/settings", "Settings"],
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const sync = useRunSync();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed top-1/4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg rounded-2xl bg-card/95 backdrop-blur border border-border shadow-2xl p-2"
    >
      <Command.Input
        placeholder="Type a command or jump to a page…"
        className="w-full bg-transparent outline-none px-3 py-2 text-sm"
      />
      <Command.List className="max-h-72 overflow-y-auto">
        <Command.Empty className="px-3 py-2 text-sm text-muted-foreground">
          No results.
        </Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item
            onSelect={() => {
              sync.mutate();
              setOpen(false);
            }}
          >
            Sync now
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Pages">
          {PAGES.map(([to, label]) => (
            <Command.Item
              key={to}
              onSelect={() => {
                nav({ to: to as string });
                setOpen(false);
              }}
            >
              {label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
