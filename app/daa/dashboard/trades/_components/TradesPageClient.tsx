"use client";

import { useTradesModel } from "@/app/daa/dashboard/_hooks/useTradesModel";
import { DashboardEmptyState } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import {
  TradesErrorState,
  TradesHeader,
  TradesCompactOverview,
  TradesTabsPanel,
} from "@/app/daa/dashboard/trades/_components/TradesSections";

export default function TradesPageClient() {
  const model = useTradesModel();

  if (model.loading) {
    return (
      <div className="space-y-4">
        <TradesHeader model={model} />
        <DashboardEmptyState
          title="正在加载交易记录…"
          description="正在读取订单与调仓周期历史。"
          className="px-5 py-16"
        />
        <TradesErrorState error={model.error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TradesHeader model={model} />
      <TradesErrorState error={model.error} />
      <SectionErrorBoundary sectionName="交易概览">
        <TradesCompactOverview model={model} />
      </SectionErrorBoundary>
      <SectionErrorBoundary sectionName="交易记录">
        <TradesTabsPanel model={model} />
      </SectionErrorBoundary>
    </div>
  );
}
