"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import type React from "react";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

import { DaaMobileNav, DaaSidebarNav } from "../../_components/DaaNav";
import DaaUserMenuDialog from "../../_components/DaaUserMenuDialog";
import { cn } from "@/lib/utils";
import { DAA_BRAND_NAME } from "@/src/daa/brand";

type Props = {
  children: React.ReactNode;
};

const SECTION_META = {
  workbench: {
    label: "工作台",
    hint: "账户概览、风险信号、组合操作与执行都在这里处理",
  },
  trades: {
    label: "交易记录",
    hint: "周期、订单与复盘报告审计中心",
  },
  settings: {
    label: "设置",
    hint: "策略、风控、数据源与通知配置",
  },
} as const;

function resolveSection(pathname: string) {
  if (pathname.startsWith("/daa/dashboard/workbench")) return "workbench" as const;
  if (pathname.startsWith("/daa/dashboard/trades")) return "trades" as const;
  if (pathname.startsWith("/daa/dashboard/settings")) return "settings" as const;
  return "workbench" as const;
}

export default function DashboardShell({ children }: Props) {
  const pathname = usePathname() || "/daa/dashboard/workbench";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem("daa:sidebar:collapsed");
    if (saved === "0") setSidebarCollapsed(false);
  }, []);

  const currentSection = useMemo(() => SECTION_META[resolveSection(pathname)], [pathname]);

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

      <div className="flex min-h-screen w-full overflow-x-clip bg-transparent">
        <aside
          className={cn(
            "daa-shell-surface daa-scrollbar hidden h-screen shrink-0 border-r border-[var(--border)] transition-[width] duration-300 ease-out lg:sticky lg:top-0 lg:flex lg:flex-col",
            sidebarCollapsed ? "w-16" : "w-[216px]",
          )}
        >
          <div className={cn("border-b border-[var(--border)]", sidebarCollapsed ? "px-2 py-3" : "px-3 py-3")}>
            <div className={cn("flex items-center", sidebarCollapsed ? "flex-col gap-2" : "gap-2.5")}>
              <Link
                href="/daa/dashboard/workbench"
                aria-label="DAA dashboard"
                className="group relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <span className="absolute inset-0 bg-[linear-gradient(135deg,#38BDF8,#818CF8)]" />
                <span className="relative">D</span>
              </Link>

              {!sidebarCollapsed ? (
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">
                  {DAA_BRAND_NAME}
                </span>
              ) : null}

              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {sidebarCollapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className={cn("flex-1 overflow-y-auto", sidebarCollapsed ? "px-1.5 py-2" : "px-2 py-2")}>
            <DaaSidebarNav collapsed={sidebarCollapsed} />
          </div>

        </aside>

        <main className="min-w-0 flex-1 overflow-x-clip">
          <header className="sticky top-0 z-30 hidden border-b border-[var(--border)] bg-[rgba(8,12,20,0.86)] backdrop-blur-xl lg:block">
            <div className="flex h-14 items-center gap-4 px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-medium text-[var(--text)]">{currentSection.label}</span>
                  <span className="text-[var(--faint)]">&mdash;</span>
                  <span className="text-[13px] text-[var(--muted)]">{currentSection.hint}</span>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <DaaUserMenuDialog />
              </div>
            </div>
          </header>

          <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[rgba(8,12,20,0.92)] backdrop-blur-xl lg:hidden">
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
            className="min-w-0 w-full max-w-full overflow-x-clip px-4 py-5 sm:px-5 lg:px-7 lg:py-7"
          >
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </section>
        </main>
      </div>
    </>
  );
}
