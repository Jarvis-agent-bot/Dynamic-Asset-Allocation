"use client";

import { useEffect, type MouseEvent } from "react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DaaSurfaceSectionAnchor } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { WorkbenchActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchActiveTabPanel";
import { WorkbenchBannerStack } from "@/app/daa/dashboard/workbench/_components/WorkbenchBannerStack";
import { WorkbenchCockpitSection } from "@/app/daa/dashboard/workbench/_components/WorkbenchCockpitSection";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { WorkbenchSummaryHeader } from "@/app/daa/dashboard/workbench/_components/WorkbenchSummaryHeader";
import {
  getWorkbenchHref,
  resolveWorkbenchTabFromLocation,
  shouldHandleWorkbenchAnchorClick,
} from "@/app/daa/dashboard/workbench/_components/workbenchNavigation";

class WorkbenchErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[WorkbenchErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[16px] border border-[rgba(248,113,113,0.24)] bg-[rgba(248,113,113,0.08)] p-6 text-center">
          <h3 className="text-lg font-semibold text-[var(--danger)]">工作台加载异常</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">{this.state.error?.message || "未知错误"}</p>
          <button
            className="mt-4 rounded-[12px] bg-[var(--danger)] px-4 py-2 text-sm text-white transition-colors hover:brightness-110"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WorkbenchPageClient(props: {
  initialTab?: string;
  initialSection?: string;
}) {
  const model = useWorkbenchPageModel({ initialTab: props.initialTab });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const tabParam = searchParams.get("tab");

  useEffect(() => {
    const nextTab = resolveWorkbenchTabFromLocation({
      section: sectionParam || props.initialSection,
      searchTab: tabParam || props.initialTab,
      fallbackTab: model.activeTab,
    });
    if (model.activeTab !== nextTab) {
      model.setActiveTab(nextTab);
    }
  }, [model.activeTab, model.setActiveTab, props.initialSection, props.initialTab, sectionParam, tabParam]);

  useEffect(() => {
    if (!sectionParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("section");
    const nextTab = resolveWorkbenchTabFromLocation({
      section: sectionParam,
      searchTab: tabParam || props.initialTab,
      fallbackTab: model.activeTab,
    });
    params.set("tab", nextTab);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [model.activeTab, pathname, props.initialTab, router, searchParams, sectionParam, tabParam]);

  function navigateToTab(tab: WorkbenchTab) {
    model.setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("section");
    params.set("tab", tab);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  function handleSectionAnchor(event: MouseEvent<HTMLAnchorElement>, tab: WorkbenchTab) {
    if (!shouldHandleWorkbenchAnchorClick(event)) return;
    event.preventDefault();
    navigateToTab(tab);
  }

  const activeTopTab = model.activeTab === "watchlist" ? "watchlist" : model.activeTab;
  const portfolioTab = model.activeTab === "watchlist" ? "watchlist" : "positions";
  const navigationItems: Array<{ key: WorkbenchTab; label: string; active: boolean }> = [
    { key: portfolioTab, label: "组合", active: model.activeTab === "watchlist" || model.activeTab === "positions" },
    { key: "rebalance", label: "调仓", active: activeTopTab === "rebalance" },
    { key: "cash", label: "现金", active: activeTopTab === "cash" },
  ];

  return (
    <WorkbenchErrorBoundary>
      <div className="space-y-4">
        <WorkbenchBannerStack
          error={model.error}
          authRequired={model.authRequired}
          bootstrap={model.bootstrap}
          executionReceipt={model.executionReceipt}
          onClearExecutionReceipt={model.clearExecutionReceipt}
        />

        <WorkbenchSummaryHeader
          baseCurrency={model.bootstrap?.baseCurrency || "USD"}
          totalEquity={model.totalEquity}
          holdingsValue={model.holdingsValue}
          availableCashValue={model.availableCashValue}
          frozenCashValue={model.frozenCashValue}
          cashMutationsAllowed={model.bootstrap?.account.cashMutationsAllowed ?? true}
          readOnlyReason={model.bootstrap?.account.readOnlyReason || null}
          accountBreakdown={model.bootstrap?.account.accountBreakdown || []}
          ledgerMeta={model.ledgerMeta}
          marketDataHealth={model.bootstrap?.marketDataHealth || null}
          equityDelta={model.equityDelta}
          notificationStatus={model.notificationStatus}
          loading={model.loading && !model.bootstrap}
          refreshing={model.refreshing}
          priceStreamConnected={model.priceStreamConnected}
          onRefresh={() => void model.loadBootstrap(true)}
        />

        {model.bootstrap ? (
          <SectionErrorBoundary sectionName="驾驶舱">
            <WorkbenchCockpitSection model={model} />
          </SectionErrorBoundary>
        ) : null}

        <div className="space-y-4">
          <div className="grid gap-2 rounded-[18px] border border-[var(--border)] bg-[rgba(13,19,32,0.8)] p-2 md:grid-cols-3">
            {navigationItems.map((item) => (
              <DaaSurfaceSectionAnchor
                key={item.key}
                href={getWorkbenchHref(item.key)}
                label={item.label}
                active={item.active}
                onClick={(event) => handleSectionAnchor(event, item.key)}
              />
            ))}
          </div>

          {model.bootstrap ? (
            <SectionErrorBoundary sectionName="标签面板">
              <WorkbenchActiveTabPanel model={model} onNavigateTab={navigateToTab} />
            </SectionErrorBoundary>
          ) : null}
        </div>

        <WorkbenchDialogs {...model.dialogProps} />
      </div>
    </WorkbenchErrorBoundary>
  );
}
