"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

import { WorkbenchPortfolioStatus } from "@/app/daa/dashboard/workbench/_components/WorkbenchPortfolioStatus";
import { WorkbenchActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchActiveTabPanel";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { resolveWorkbenchTabFromLocation } from "@/app/daa/dashboard/workbench/_components/workbenchNavigation";

export default function PortfolioPageClient(props: { initialTab?: string }) {
  const wbModel = useWorkbenchPageModel({ initialTab: props.initialTab });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  useEffect(() => {
    const nextTab = resolveWorkbenchTabFromLocation({
      section: null,
      searchTab: tabParam || props.initialTab,
      fallbackTab: wbModel.activeTab,
    });
    if (wbModel.activeTab !== nextTab) wbModel.setActiveTab(nextTab);
  }, [wbModel.activeTab, wbModel.setActiveTab, props.initialTab, tabParam]);

  function navigateToTab(tab: WorkbenchTab) {
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
          <WorkbenchPortfolioStatus
            baseCurrency={wbModel.bootstrap.baseCurrency}
            totalEquity={wbModel.totalEquity}
            holdingsValue={wbModel.holdingsValue}
            availableCashValue={wbModel.availableCashValue}
            frozenCashValue={wbModel.frozenCashValue}
            equityDelta={wbModel.equityDelta}
            snapshots={wbModel.snapshots || []}
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
        <SectionErrorBoundary sectionName="资产工作台">
          <WorkbenchActiveTabPanel model={wbModel} onNavigateTab={navigateToTab} />
        </SectionErrorBoundary>
      ) : null}

      <WorkbenchDialogs {...wbModel.dialogProps} />
    </div>
  );
}
