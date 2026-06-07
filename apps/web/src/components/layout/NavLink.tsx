import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
  return (
    <Link
      to={to}
      className={cn(
        "px-3 py-1.5 rounded-md text-sm transition-colors",
        active
          ? "text-foreground bg-secondary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
      )}
    >
      {children}
    </Link>
  );
}
