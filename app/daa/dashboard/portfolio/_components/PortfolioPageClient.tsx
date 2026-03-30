"use client";

import { useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

import { WorkbenchPortfolioStatus } from "@/app/daa/dashboard/workbench/_components/WorkbenchPortfolioStatus";
import { WorkbenchActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchActiveTabPanel";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { resolveWorkbenchTabFromLocation } from "@/app/daa/dashboard/workbench/_components/workbenchNavigation";

import { FxExposurePanel } from "./FxExposurePanel";
import { CashAnalyticsPanel } from "./CashAnalyticsPanel";
import { PortfolioRiskDashboard } from "./PortfolioRiskDashboard";
import { PerformanceAttribution } from "./PerformanceAttribution";
import { DividendCalendar } from "./DividendCalendar";
import { HfHoldingsPanel } from "./HfHoldingsPanel";

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
          <div className="space-y-3">
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
            <div className="flex gap-4 text-xs">
              <Link href="/daa/dashboard/rebalance" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                去调仓 →
              </Link>
              <Link href="/daa/dashboard/today" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                去投委会 →
              </Link>
            </div>
          </div>
        </SectionErrorBoundary>
      ) : null}

      {/* 持仓 / 观察列表 */}
      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="资产工作台">
          <WorkbenchActiveTabPanel model={wbModel} onNavigateTab={navigateToTab} />
        </SectionErrorBoundary>
      ) : null}

      {/* 现金分析 + 汇率敞口 — 持仓管理区 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionErrorBoundary sectionName="现金分析">
          <Suspense fallback={null}>
            <CashAnalyticsPanel />
          </Suspense>
        </SectionErrorBoundary>
        {wbModel.bootstrap ? (
          <SectionErrorBoundary sectionName="汇率敞口">
            <FxExposurePanel bootstrap={wbModel.bootstrap} />
          </SectionErrorBoundary>
        ) : null}
      </div>

      {/* 风险仪表盘 — 持仓风险一览 */}
      <SectionErrorBoundary sectionName="风险指标">
        <Suspense fallback={null}>
          <PortfolioRiskDashboard />
        </Suspense>
      </SectionErrorBoundary>

      {/* 股息日历 + 大佬动向 — 信息区 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionErrorBoundary sectionName="股息日历">
          <Suspense fallback={null}>
            <DividendCalendar />
          </Suspense>
        </SectionErrorBoundary>
        <SectionErrorBoundary sectionName="大佬动向">
          <Suspense fallback={null}>
            <HfHoldingsPanel />
          </Suspense>
        </SectionErrorBoundary>
      </div>

      {/* 绩效归因 — 复盘区 */}
      <SectionErrorBoundary sectionName="绩效归因">
        <Suspense fallback={null}>
          <PerformanceAttribution />
        </Suspense>
      </SectionErrorBoundary>

      <WorkbenchDialogs {...wbModel.dialogProps} />
    </div>
  );
}
