"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";
import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";

import { ActiveTabPanel } from "@/app/daa/dashboard/_shared/ActiveTabPanel";
import { DashboardDialogs } from "@/app/daa/dashboard/_shared/DashboardDialogs";
import { resolveTabFromLocation } from "@/app/daa/dashboard/_shared/dashboardNavigation";
import { PortfolioHomeOverview } from "./PortfolioHomeOverview";
import { PortfolioFundamentalsTable } from "./PortfolioFundamentalsTable";

function PortfolioLoadingState() {
  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[linear-gradient(180deg,var(--elevated),var(--surface))] p-5 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--border)]" />
            <div className="h-8 w-56 animate-pulse rounded bg-[var(--border)]" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded bg-[var(--border)]" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--border)]" />
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface)]" />
          ))}
        </div>
        <div className="mt-5">
          <SkeletonChart height={240} />
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="h-44 animate-pulse rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)]" />
        <div className="h-44 animate-pulse rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)]" />
      </div>
    </div>
  );
}

export default function PortfolioPageClient(props: { initialTab?: string }) {
  const wbModel = useDashboardPageModel({ initialTab: props.initialTab });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  useEffect(() => {
    const nextTab = resolveTabFromLocation({
      section: null,
      searchTab: tabParam || props.initialTab,
      fallbackTab: wbModel.activeTab,
    });
    if (wbModel.activeTab !== nextTab) wbModel.setActiveTab(nextTab);
  }, [wbModel.activeTab, wbModel.setActiveTab, props.initialTab, tabParam]);

  function navigateToTab(tab: DashboardTab) {
    wbModel.setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    if (tab === "analysis") {
      window.setTimeout(() => {
        document.getElementById("portfolio-risk-overview")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
    }
  }

  function navigateToRebalance() {
    router.push("/daa/dashboard/rebalance");
  }

  const baseCurrency = wbModel.bootstrap?.baseCurrency || "USD";

  return (
    <div className="space-y-4">
      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="资产中枢">
        <PortfolioHomeOverview
          baseCurrency={baseCurrency}
          totalEquity={wbModel.totalEquity}
          holdingsValue={wbModel.holdingsValue}
          availableCashValue={wbModel.availableCashValue}
          frozenCashValue={wbModel.frozenCashValue}
          holdingCount={wbModel.summary.holdingAssets}
          watchlistCount={wbModel.summary.watchlistAssets}
          rows={wbModel.tableProps.rows}
          snapshots={wbModel.snapshots || []}
          cashFlowEvents={wbModel.cashLedger?.filter((e) => (e.side === "deposit" || e.side === "withdraw") && e.entryKind === "manual").map((e) => ({ ts: e.ts, side: e.side as "deposit" | "withdraw", amount: e.amountInAccountBase ?? e.amount })) ?? []}
          equityDelta={wbModel.equityDelta}
          latestCycle={wbModel.bootstrap.latestCycle}
          refreshing={wbModel.refreshing}
          priceStreamConnected={wbModel.priceStreamConnected}
          onRefresh={() => void wbModel.loadBootstrap(true)}
          onCashRefresh={() => void wbModel.loadBootstrap(true)}
          onOpenRebalance={navigateToRebalance}
        />
        </SectionErrorBoundary>
      ) : (
        <PortfolioLoadingState />
      )}

      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="持仓基本面">
          <PortfolioFundamentalsTable />
        </SectionErrorBoundary>
      ) : null}

      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="资产列表">
          <ActiveTabPanel model={wbModel} onNavigateTab={navigateToTab} />
        </SectionErrorBoundary>
      ) : null}

      <DashboardDialogs {...wbModel.dialogProps} />
    </div>
  );
}
