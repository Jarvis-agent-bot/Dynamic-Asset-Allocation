"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import type React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { DaaMobileNav, DaaSidebarNav } from "../../_components/DaaNav";
import DaaThemeToggle from "../../_components/DaaThemeToggle";
import DaaUserMenuDialog from "../../_components/DaaUserMenuDialog";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem("daa:sidebar:collapsed");
    if (saved === "0") setSidebarCollapsed(false);
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("daa:sidebar:collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      <a
        href="#daa-dashboard-main-content"
        className="sr-only fixed left-2 top-2 z-50 rounded-sm border bg-background px-3 py-2 text-xs text-foreground shadow focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        跳转到主内容
      </a>
      <div className="flex min-h-screen w-full overflow-x-clip">
        <aside className={`hidden h-screen shrink-0 border-r bg-background/95 transition-[width] duration-200 lg:sticky lg:top-0 lg:block ${sidebarCollapsed ? "w-[96px]" : "w-[196px]"}`}>
          <div className={`flex h-full flex-col py-4 ${sidebarCollapsed ? "px-2" : "px-3"}`}>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href="/daa/dashboard"
                  className="rounded-sm text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                  aria-label="DAA dashboard"
                >
                  {sidebarCollapsed ? "DAA" : "Dynamic Asset Allocation"}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={toggleSidebar}
                  aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                  title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
              </div>
              {!sidebarCollapsed ? <div className="text-sm text-muted-foreground">资产配置与执行中心</div> : null}
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              <Suspense fallback={<SidebarNavSkeleton />}>
                <DaaSidebarNav collapsed={sidebarCollapsed} />
              </Suspense>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-clip">
          <header className="sticky top-0 z-30 hidden items-center justify-end gap-2 border-b bg-background/95 px-3 py-3 backdrop-blur lg:flex lg:px-4">
            <DaaThemeToggle />
            <DaaUserMenuDialog />
          </header>

          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:hidden">
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
              <DaaThemeToggle />
              <DaaUserMenuDialog />
            </div>
          </header>

          <section id="daa-dashboard-main-content" className="min-w-0 w-full max-w-full overflow-x-clip px-3 py-4 sm:px-4 lg:px-5 lg:py-5">
            {children}
          </section>
        </main>
      </div>
    </>
  );
}
