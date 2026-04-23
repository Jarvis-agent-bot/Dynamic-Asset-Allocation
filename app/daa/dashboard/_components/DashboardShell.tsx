"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import type React from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { DaaMobileNav, DaaSidebarNav } from "../../_components/DaaNav";
import DaaUserMenuDialog from "../../_components/DaaUserMenuDialog";
import { cn } from "@/lib/utils";
import { DAA_BRAND_NAME } from "@/src/daa/brand";

type Props = {
  children: React.ReactNode;
};

const SECTION_META: Record<string, { label: string; hint: string }> = {
  today: {
    label: "Agent",
    hint: "认知 Agent 日报与研究论点",
  },
  portfolio: {
    label: "持仓",
    hint: "资产配置与观察列表管理",
  },
  rebalance: {
    label: "调仓",
    hint: "查看市场环境，审阅建议并执行再平衡",
  },
  trades: {
    label: "交易记录",
    hint: "周期、订单与复盘报告",
  },
  "strategy-lab": {
    label: "策略实验室",
    hint: "回测资产配置策略",
  },
  settings: {
    label: "设置",
    hint: "策略、风控与通知配置",
  },
};

const DEFAULT_SECTION_META = { label: "控制台", hint: "" };

function resolveSection(pathname: string): string {
  if (pathname.startsWith("/daa/dashboard/today")) return "today";
  if (pathname.startsWith("/daa/dashboard/portfolio")) return "portfolio";
  if (pathname.startsWith("/daa/dashboard/rebalance")) return "rebalance";
  if (pathname.startsWith("/daa/dashboard/trades")) return "trades";
  if (pathname.startsWith("/daa/dashboard/strategy-lab")) return "strategy-lab";
  if (pathname.startsWith("/daa/dashboard/settings")) return "settings";
  return "portfolio";
}

export default function DashboardShell({ children }: Props) {
  const pathname = usePathname() || "/daa/dashboard/portfolio";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("daa:sidebar:collapsed");
    if (stored === "0") setSidebarCollapsed(false);
    setHydrated(true);
  }, []);

  const currentSection = useMemo(() => SECTION_META[resolveSection(pathname)] ?? DEFAULT_SECTION_META, [pathname]);

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
        {/* ─── 侧边栏（Claude 风格：无边框、微妙背景差、圆角导航） ─── */}
        <aside
          className={cn(
            "daa-scrollbar hidden h-screen shrink-0 transition-[width] duration-300 ease-out lg:sticky lg:top-0 lg:flex lg:flex-col",
            "bg-[rgba(6,10,18,0.6)]",
            sidebarCollapsed ? "w-[60px]" : "w-[220px]",
          )}
        >
          {/* 顶部：Logo + 品牌名 + 折叠按钮 */}
          <div className={cn("flex-shrink-0", sidebarCollapsed ? "px-2.5 py-4" : "px-3.5 py-4")}>
            <div className={cn("flex items-center", sidebarCollapsed ? "flex-col gap-3" : "gap-2.5")}>
              <Link
                href="/daa/dashboard/portfolio"
                aria-label="DAA dashboard"
                className="group relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-bold text-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--faint)] transition-all hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* 导航区 */}
          <div className={cn("flex-1 overflow-y-auto", sidebarCollapsed ? "px-1.5 py-1" : "px-2.5 py-1")}>
            <DaaSidebarNav collapsed={sidebarCollapsed} />
          </div>

          {/* 底部：用户头像（展开时显示） */}
          {!sidebarCollapsed ? (
            <div className="flex-shrink-0 px-3.5 py-3">
              <div className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-[var(--muted)] transition-colors hover:bg-[rgba(255,255,255,0.04)]">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-[11px] font-semibold text-[var(--text)]">
                  U
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-[var(--text)]">账户</div>
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        <main className="min-w-0 flex-1 overflow-x-clip">
          {/* ─── 顶部栏（桌面）─── */}
          <header className="sticky top-0 z-30 hidden border-b border-[rgba(255,255,255,0.06)] bg-[rgba(8,12,20,0.86)] backdrop-blur-xl lg:block">
            <div className="flex h-12 items-center gap-4 px-6">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-[var(--text)]">{currentSection.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <DaaUserMenuDialog />
              </div>
            </div>
          </header>

          {/* ─── 顶部栏（移动） ─── */}
          <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(8,12,20,0.92)] backdrop-blur-xl lg:hidden">
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
            className="min-w-0 w-full max-w-full overflow-x-clip px-4 py-5 sm:px-5 lg:px-7 lg:py-6"
          >
            <div className="mx-auto max-w-[1440px]">{children}</div>
          </section>
        </main>
      </div>
    </>
  );
}
