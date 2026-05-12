import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { BalancePill } from "@/components/balance/BalancePill";
import { SyncButton } from "@/components/sync/SyncButton";
import { SyncRunBadge } from "@/components/sync/SyncRunBadge";
import { NavLink } from "./NavLink";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 backdrop-blur-md bg-background/70">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center gap-4">
        <Link to="/" className="font-semibold tracking-tight text-base">
          Overtide
        </Link>
        <nav className="flex items-center gap-1 ml-2">
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/earning">Earning</NavLink>
          <NavLink to="/redemptions">Redemptions</NavLink>
          <NavLink to="/unlinked">Unlinked</NavLink>
          <NavLink to="/timeline">Timeline</NavLink>
          <NavLink to="/sync">Sync</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <BalancePill />
          <SyncRunBadge />
          <SyncButton />
          <Link
            to="/settings"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Settings"
          >
            <Settings size={18} />
          </Link>
        </div>
      </div>
    </header>
  );
}
