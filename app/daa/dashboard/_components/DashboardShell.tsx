import Link from "next/link";
import { Suspense } from "react";
import type React from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { DaaMobileNav, DaaSidebarNav } from "../../_components/DaaNav";
import DaaThemeToggle from "../../_components/DaaThemeToggle";
import DaaUserMenuDialog from "../../_components/DaaUserMenuDialog";

import DaaDashboardRefreshIndicator from "./DaaDashboardRefreshIndicator";

type Props = {
  children: React.ReactNode;
};

function SidebarNavSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-hidden="true">
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function MobileNavSkeleton() {
  return <Skeleton className="h-10 w-10 shrink-0" aria-hidden="true" />;
}

// Dashboard-only shell (sidebar + topbar + content).
export default function DashboardShell({ children }: Props) {
  return (
    <>
      <a
        href="#daa-dashboard-main-content"
        className="sr-only fixed left-3 top-3 z-50 rounded-sm border bg-background px-3 py-2 text-xs text-foreground shadow focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to dashboard content
      </a>
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

          <Suspense fallback={<SidebarNavSkeleton />}>
            <DaaSidebarNav />
          </Suspense>
        </aside>

        <main id="daa-dashboard-main-content" className="min-w-0 flex-1">
          <header className="mb-6 hidden items-center justify-end gap-2 lg:flex">
            <DaaDashboardRefreshIndicator compact />
            <DaaThemeToggle />
            <DaaUserMenuDialog />
          </header>

          <header className="mb-6 flex items-center justify-between gap-3 lg:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <Suspense fallback={<MobileNavSkeleton />}>
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
              <DaaThemeToggle />
              <DaaUserMenuDialog />
            </div>
          </header>

          {children}
        </main>
      </div>
    </>
  );
}
