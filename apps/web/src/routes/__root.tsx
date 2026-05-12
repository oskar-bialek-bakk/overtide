import type { QueryClient } from "@tanstack/react-query";
import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";

const NAV: Array<{ to: string; label: string }> = [
  { to: "/", label: "Dashboard" },
  { to: "/earning", label: "Earning" },
  { to: "/redemptions", label: "Redemptions" },
  { to: "/unlinked", label: "Unlinked" },
  { to: "/timeline", label: "Timeline" },
  { to: "/sync", label: "Sync" },
  { to: "/settings", label: "Settings" },
];

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3 text-sm">
          <span className="font-semibold">Overtide</span>
          <span className="opacity-40">/</span>
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="opacity-70 hover:opacity-100 [&.active]:opacity-100 [&.active]:font-medium"
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  ),
});
