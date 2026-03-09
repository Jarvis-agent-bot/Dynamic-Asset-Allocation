"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import type React from "react";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

import { DaaMobileNav, DaaSidebarNav } from "../../_components/DaaNav";
import DaaUserMenuDialog from "../../_components/DaaUserMenuDialog";
import { cn } from "@/lib/utils";
import { DeepLedgerStatusPill } from "./DeepLedgerUI";

type Props = {
  children: React.ReactNode;
};

const SECTION_META = {
  overview: {
    label: "总览",
    hint: "KPI、提醒、净值曲线与资金流水",
  },
  workbench: {
    label: "工作台",
    hint: "资产池、建议生成、风险审阅与执行确认",
  },
  "strategy-lab": {
    label: "策略实验室",
    hint: "回测候选、净值曲线与目标写回",
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
  if (pathname.startsWith("/daa/dashboard/workbench") || pathname.startsWith("/daa/dashboard/portfolio")) return "workbench" as const;
  if (pathname.startsWith("/daa/dashboard/strategy-lab")) return "strategy-lab" as const;
  if (pathname.startsWith("/daa/dashboard/trades")) return "trades" as const;
  if (pathname.startsWith("/daa/dashboard/settings")) return "settings" as const;
  return "overview" as const;
}

export default function DashboardShell({ children }: Props) {
  const pathname = usePathname() || "/daa/dashboard";
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
            "daa-shell-surface daa-dot-grid daa-scrollbar hidden h-screen shrink-0 border-r border-[var(--border)] transition-[width] duration-300 ease-out lg:sticky lg:top-0 lg:flex lg:flex-col",
            sidebarCollapsed ? "w-[96px]" : "w-[286px]",
          )}
        >
          <div className={cn("border-b border-[var(--border)]", sidebarCollapsed ? "px-3 pb-3 pt-4" : "px-4 pb-4 pt-5")}>
            <div className={cn("flex gap-3", sidebarCollapsed ? "flex-col items-center" : "items-start")}>
              <Link
                href="/daa/dashboard"
                aria-label="DAA dashboard"
                className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-sm font-bold text-white shadow-[0_18px_30px_rgba(56,189,248,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <span className="absolute inset-0 bg-[linear-gradient(135deg,#38BDF8,#818CF8)] transition-transform duration-300 group-hover:scale-105" />
                <span className="relative">D</span>
              </Link>

              {!sidebarCollapsed ? (
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="truncate font-[var(--font-display)] text-[24px] leading-none tracking-[-0.03em] text-[var(--text)]">
                    DeepLedger
                  </div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
                    Bloomberg x SaaS Console
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                aria-pressed={!sidebarCollapsed}
                title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-[var(--muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-all duration-200 hover:border-[rgba(56,189,248,0.24)] hover:bg-[rgba(56,189,248,0.08)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  sidebarCollapsed ? "mx-auto" : "mt-0.5",
                )}
              >
                {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              </button>
            </div>

          </div>

          <div className={cn("flex-1 overflow-y-auto", sidebarCollapsed ? "px-3 py-4" : "px-3 py-4")}>
            {!sidebarCollapsed ? (
              <div className="px-1 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
                导航
              </div>
            ) : (
              <div className="pb-3 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--faint)]">
                菜单
              </div>
            )}
            <DaaSidebarNav collapsed={sidebarCollapsed} />
          </div>

          <div className={cn("border-t border-[var(--border)] flex justify-center", sidebarCollapsed ? "px-3 py-4" : "px-4 py-4")}>
            <DeepLedgerStatusPill tone="green">在线</DeepLedgerStatusPill>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-clip">
          <header className="sticky top-0 z-30 hidden border-b border-[var(--border)] bg-[rgba(8,12,20,0.86)] backdrop-blur-xl lg:block">
            <div className="flex min-h-[72px] items-center gap-4 px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
                  <span>Deep Ledger</span>
                  <span className="text-[var(--border-strong)]">/</span>
                  <span className="text-[var(--amber)]">{currentSection.label}</span>
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">{currentSection.hint}</div>
              </div>
              <div className="ml-auto flex items-center gap-2.5">
                <DeepLedgerStatusPill tone="green">系统在线</DeepLedgerStatusPill>
                <DaaUserMenuDialog />
              </div>
            </div>
          </header>

          <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[rgba(8,12,20,0.92)] backdrop-blur-xl lg:hidden">
            <div className="flex min-h-[60px] items-center justify-between gap-3 px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <Suspense fallback={<div className="h-8 w-8 rounded bg-[var(--elevated)]" />}>
                  <DaaMobileNav />
                </Suspense>
                <div className="min-w-0">
                  <Link
                    href="/daa/dashboard"
                    className="block truncate font-[var(--font-display)] text-lg tracking-[-0.03em] text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    DeepLedger
                  </Link>
                  <div className="truncate text-[11px] uppercase tracking-[0.18em] text-[var(--faint)]">
                    {currentSection.label}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DeepLedgerStatusPill tone="green" className="hidden sm:inline-flex">在线</DeepLedgerStatusPill>
                <DaaUserMenuDialog />
              </div>
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
