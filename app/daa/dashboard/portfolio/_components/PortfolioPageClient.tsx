"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { PortfolioWorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchReadModel";
import { useAssetWorkbenchModel } from "@/app/daa/dashboard/_hooks/useAssetWorkbenchModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";

import { WorkbenchDialogs } from "@/app/daa/dashboard/_shared/WorkbenchDialogs";
import { resolveTabFromLocation } from "@/app/daa/dashboard/_shared/workbenchNavigation";
import { PortfolioHomeOverview } from "./PortfolioHomeOverview";
import { PortfolioFundamentalsTable } from "./PortfolioFundamentalsTable";
import { PortfolioWorkbenchPanel } from "./PortfolioWorkbenchPanel";

function PortfolioLoadingState() {
  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <div className="h-3 w-24 animate-pulse rounded-[var(--radius-sm)] bg-[var(--border)]" />
            <div className="h-8 w-56 animate-pulse rounded bg-[var(--border)]" />
            <div className="h-4 w-80 max-w-full animate-pulse rounded bg-[var(--border)]" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--border)]" />
        </div>
        <div className="mt-5 grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-20 animate-pulse border-b border-[var(--border)] bg-[var(--elevated)] sm:odd:border-r xl:border-b-0 xl:border-r xl:last:border-r-0" />
          ))}
        </div>
        <div className="mt-5">
          <SkeletonChart height={240} />
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="h-44 animate-pulse rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]" />
        <div className="h-44 animate-pulse rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]" />
      </div>
    </div>
  );
}

export default function PortfolioPageClient(props: { initialTab?: string }) {
  const assetWorkbenchModel = useAssetWorkbenchModel({ initialTab: props.initialTab });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  useEffect(() => {
    const nextTab = resolveTabFromLocation({
      section: null,
      searchTab: tabParam || props.initialTab,
      fallbackTab: assetWorkbenchModel.activeTab,
    });
    if (assetWorkbenchModel.activeTab !== nextTab) assetWorkbenchModel.setActiveTab(nextTab);
  }, [assetWorkbenchModel.activeTab, assetWorkbenchModel.setActiveTab, props.initialTab, tabParam]);

  function navigateToTab(tab: PortfolioWorkbenchTab) {
    assetWorkbenchModel.setActiveTab(tab);
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

  const baseCurrency = assetWorkbenchModel.bootstrap?.baseCurrency || "USD";

  return (
    <div className="space-y-4">
      {assetWorkbenchModel.bootstrap ? (
        <SectionErrorBoundary sectionName="资产中枢">
          <PortfolioHomeOverview
            baseCurrency={baseCurrency}
            totalEquity={assetWorkbenchModel.totalEquity}
            holdingsValue={assetWorkbenchModel.holdingsValue}
            availableCashValue={assetWorkbenchModel.availableCashValue}
            frozenCashValue={assetWorkbenchModel.frozenCashValue}
            holdingCount={assetWorkbenchModel.summary.holdingAssets}
            watchlistCount={assetWorkbenchModel.summary.watchlistAssets}
            rows={assetWorkbenchModel.tableProps.rows}
            snapshots={assetWorkbenchModel.snapshots || []}
            cashFlowEvents={assetWorkbenchModel.cashLedger?.filter((cashEntry) => (cashEntry.side === "deposit" || cashEntry.side === "withdraw") && cashEntry.entryKind === "manual").map((cashEntry) => ({ ts: cashEntry.ts, side: cashEntry.side as "deposit" | "withdraw", amount: cashEntry.amountInAccountBase ?? cashEntry.amount })) ?? []}
            equityDelta={assetWorkbenchModel.equityDelta}
            latestCycle={assetWorkbenchModel.bootstrap.latestCycle}
            refreshing={assetWorkbenchModel.refreshing}
            priceStreamConnected={assetWorkbenchModel.priceStreamConnected}
            onRefresh={() => void assetWorkbenchModel.loadBootstrap(true)}
            onCashRefresh={() => void assetWorkbenchModel.loadBootstrap(true)}
            onOpenRebalance={navigateToRebalance}
          />
        </SectionErrorBoundary>
      ) : (
        <PortfolioLoadingState />
      )}

      {assetWorkbenchModel.bootstrap ? (
        <SectionErrorBoundary sectionName="持仓基本面">
          <PortfolioFundamentalsTable />
        </SectionErrorBoundary>
      ) : null}

      {assetWorkbenchModel.bootstrap ? (
        <SectionErrorBoundary sectionName="资产列表">
          <PortfolioWorkbenchPanel model={assetWorkbenchModel} onNavigateTab={navigateToTab} />
        </SectionErrorBoundary>
      ) : null}

      <WorkbenchDialogs {...assetWorkbenchModel.dialogProps} />
    </div>
  );
}
