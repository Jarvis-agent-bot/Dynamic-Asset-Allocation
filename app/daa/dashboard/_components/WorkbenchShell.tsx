"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import type React from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { DaaBrandMark, DaaMobileNav, DaaSidebarNav } from "../../_components/DaaNav";
import DaaUserMenuDialog from "../../_components/DaaUserMenuDialog";
import { cn } from "@/lib/utils";
import { DAA_BRAND_NAME } from "@/src/daa/brand";
import { resolveWorkbenchSection } from "../../_components/workbenchSections";

type Props = {
  children: React.ReactNode;
};

export default function WorkbenchShell({ children }: Props) {
  const pathname = usePathname() || "/daa/dashboard/portfolio";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarReady, setSidebarReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("daa:sidebar:collapsed");
    if (stored === "0") setSidebarCollapsed(false);
    setSidebarReady(true);
  }, []);

  const currentSection = useMemo(() => resolveWorkbenchSection(pathname), [pathname]);

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
        className="sr-only fixed left-2 top-2 z-50 rounded border bg-background px-3 py-2 text-xs text-foreground shadow focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring"
      >
        跳转到主内容
      </a>

      <div className="min-h-screen w-full overflow-x-hidden bg-transparent">
        {/* 侧边栏：高密度金融工作台导航 */}
        <aside
          className={cn(
            "daa-scrollbar hidden h-dvh max-h-dvh shrink-0 overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:flex-col",
            sidebarReady ? "transition-[width] duration-200 ease-out" : "transition-none",
            sidebarCollapsed ? "w-[68px]" : "w-[232px]",
          )}
        >
          {/* 顶部：Logo + 品牌名 + 折叠按钮 */}
          <div className={cn("flex-shrink-0", sidebarCollapsed ? "px-3 py-4" : "px-4 py-4")}>
            <div className={cn("flex items-center", sidebarCollapsed ? "flex-col gap-3" : "gap-2.5")}>
              <Link
                href="/daa/dashboard/portfolio"
                aria-label="DAA 工作站"
                className="group relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <DaaBrandMark className="h-8 w-8" />
              </Link>

              {!sidebarCollapsed ? (
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--text)]">
                  {DAA_BRAND_NAME}
                </span>
              ) : null}

              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--muted)] transition-colors hover:bg-[var(--elevated)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* 导航区 */}
          <div className={cn("flex-1 overflow-y-auto", sidebarCollapsed ? "px-3 py-1" : "px-3 py-1")}>
            <DaaSidebarNav collapsed={sidebarCollapsed} />
          </div>

          {/* 底部：账户标识（展开时显示） */}
          {!sidebarCollapsed ? (
            <div className="flex-shrink-0 px-3.5 py-3">
              <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-[var(--muted)] transition-colors hover:bg-[var(--elevated)]">
                <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--hover)] text-[11px] font-semibold text-[var(--text)]">
                  U
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-[var(--text)]">账户</div>
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        <main
          className={cn(
            "min-w-0 max-w-full overflow-x-hidden",
            sidebarReady ? "transition-[margin-left] duration-200 ease-out" : "transition-none",
            sidebarCollapsed ? "lg:ml-[68px]" : "lg:ml-[232px]",
          )}
        >
          {/* ─── 顶部栏（桌面）─── */}
          <header className="sticky top-0 z-30 hidden border-b border-[var(--border)] bg-[var(--surface)] lg:block">
            <div className="flex h-11 items-center gap-4 px-6">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="text-sm font-semibold text-[var(--text)]">{currentSection.label}</span>
                  {currentSection.hint ? (
                    <span className="truncate text-xs text-[var(--muted)]">{currentSection.hint}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DaaUserMenuDialog />
              </div>
            </div>
          </header>

          {/* ─── 顶部栏（移动） ─── */}
          <header className="sticky top-0 z-30 border-b border-[var(--elevated)] bg-[var(--surface)] lg:hidden">
            <div className="flex h-12 items-center justify-between gap-3 px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <Suspense fallback={<div className="h-7 w-7 rounded bg-[var(--elevated)]" />}>
                  <DaaMobileNav />
                </Suspense>
                <span className="truncate text-sm font-semibold text-[var(--text)]">
                  {currentSection.label}
                </span>
              </div>
              <DaaUserMenuDialog />
            </div>
          </header>

          <section
            id="daa-dashboard-main-content"
            className="min-w-0 w-full max-w-full overflow-x-hidden px-4 py-4 sm:px-5 lg:px-6 lg:py-5 2xl:px-8"
          >
            <div className="w-full min-w-0">{children}</div>
          </section>
        </main>
      </div>
    </>
  );
}
