import Link from "next/link";
import { Suspense } from "react";
import type React from "react";

import { DaaMobileNav, DaaSidebarNav } from "../../_components/DaaNav";
import DaaUserMenuDialog from "../../_components/DaaUserMenuDialog";

import DaaDashboardRefreshIndicator from "./DaaDashboardRefreshIndicator";

type Props = {
  children: React.ReactNode;
};

// Dashboard-only shell (sidebar + topbar + content).
export default function DashboardShell({ children }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 lg:flex">
        <div className="space-y-1">
          <Link
            href="/daa/dashboard"
            className="rounded-sm text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
            aria-label="DAA dashboard"
          >
            Dynamic Asset Allocation
          </Link>
          <div className="text-sm text-muted-foreground">Console — dashboard-first</div>
          <DaaDashboardRefreshIndicator />
        </div>

        <Suspense fallback={null}>
          <DaaSidebarNav />
        </Suspense>

      </aside>

      <div className="min-w-0 flex-1">
        <header className="mb-6 hidden items-center justify-end gap-2 lg:flex">
          <DaaDashboardRefreshIndicator compact />
          <DaaUserMenuDialog />
        </header>

        <header className="mb-6 flex items-center justify-between gap-3 lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Suspense fallback={null}>
              <DaaMobileNav />
            </Suspense>
            <Link
              href="/daa/dashboard"
              className="truncate rounded-sm text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
              aria-label="DAA dashboard"
            >
              DAA
            </Link>
          </div>

          <div className="flex items-center gap-1">
            <DaaDashboardRefreshIndicator compact />
            <DaaUserMenuDialog />
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
