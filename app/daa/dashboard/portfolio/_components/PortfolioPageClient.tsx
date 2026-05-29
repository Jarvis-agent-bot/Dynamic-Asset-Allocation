"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";
import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

import { PortfolioStatus } from "@/app/daa/dashboard/_shared/PortfolioStatus";
import { ActiveTabPanel } from "@/app/daa/dashboard/_shared/ActiveTabPanel";
import { DashboardDialogs } from "@/app/daa/dashboard/_shared/DashboardDialogs";
import { resolveTabFromLocation } from "@/app/daa/dashboard/_shared/dashboardNavigation";
import { PortfolioHomeOverview } from "./PortfolioHomeOverview";
import { PortfolioFundamentalsTable } from "./PortfolioFundamentalsTable";

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
        <PortfolioHomeOverview
          baseCurrency={baseCurrency}
          totalEquity={wbModel.totalEquity}
          holdingsValue={wbModel.holdingsValue}
          availableCashValue={wbModel.availableCashValue}
          frozenCashValue={wbModel.frozenCashValue}
          holdingCount={wbModel.summary.holdingAssets}
          watchlistCount={wbModel.summary.watchlistAssets}
          rows={wbModel.tableProps.rows}
          latestCycle={wbModel.bootstrap.latestCycle}
          refreshing={wbModel.refreshing}
          priceStreamConnected={wbModel.priceStreamConnected}
          onRefresh={() => void wbModel.loadBootstrap(true)}
          onCashRefresh={() => void wbModel.loadBootstrap(true)}
          onOpenRebalance={navigateToRebalance}
        />
      ) : null}

      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="持仓基本面">
          <PortfolioFundamentalsTable />
        </SectionErrorBoundary>
      ) : null}

      {wbModel.bootstrap ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <SectionErrorBoundary sectionName="资产列表">
            <ActiveTabPanel model={wbModel} onNavigateTab={navigateToTab} />
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="组合状态">
            <div className="lg:sticky lg:top-[80px] lg:self-start">
              <PortfolioStatus
                baseCurrency={baseCurrency}
                totalEquity={wbModel.totalEquity}
                holdingsValue={wbModel.holdingsValue}
                availableCashValue={wbModel.availableCashValue}
                frozenCashValue={wbModel.frozenCashValue}
                equityDelta={wbModel.equityDelta}
                snapshots={wbModel.snapshots || []}
                cashFlowEvents={wbModel.cashLedger?.filter((e) => (e.side === "deposit" || e.side === "withdraw") && e.entryKind === "manual").map((e) => ({ ts: e.ts, side: e.side as "deposit" | "withdraw", amount: e.amountInAccountBase ?? e.amount })) ?? []}
                allocationSummary={wbModel.allocationSummary}
                loading={wbModel.loading && !wbModel.bootstrap}
                refreshing={wbModel.refreshing}
                priceStreamConnected={wbModel.priceStreamConnected}
                onRefresh={() => void wbModel.loadBootstrap(true)}
              />
            </div>
          </SectionErrorBoundary>
        </div>
      ) : null}

      <DashboardDialogs {...wbModel.dialogProps} />
    </div>
  );
}
