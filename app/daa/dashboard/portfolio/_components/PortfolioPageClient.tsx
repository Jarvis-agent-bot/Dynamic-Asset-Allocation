"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";
import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

import { PortfolioStatus } from "@/app/daa/dashboard/workbench/_components/PortfolioStatus";
import { ActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/ActiveTabPanel";
import { DashboardDialogs } from "@/app/daa/dashboard/workbench/_components/DashboardDialogs";
import { resolveTabFromLocation } from "@/app/daa/dashboard/workbench/_components/dashboardNavigation";

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
  }

  return (
    <div className="space-y-4">
      {/* 组合快照（摘要+图表，现金摘要在摘要行内） */}
      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="组合状态">
          <PortfolioStatus
            baseCurrency={wbModel.bootstrap.baseCurrency}
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
        </SectionErrorBoundary>
      ) : null}

      {/* 持仓 / 观察列表 */}
      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="资产列表">
          <ActiveTabPanel model={wbModel} onNavigateTab={navigateToTab} />
        </SectionErrorBoundary>
      ) : null}

      <DashboardDialogs {...wbModel.dialogProps} />
    </div>
  );
}
