import type { ReactNode } from "react";
import { CommandPalette } from "@/components/command/CommandPalette";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopBar />
      <CommandPalette />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
