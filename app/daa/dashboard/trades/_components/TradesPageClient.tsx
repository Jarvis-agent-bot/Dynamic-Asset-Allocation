"use client";

import { useTradesModel } from "@/app/daa/dashboard/_hooks/useTradesModel";
import { DashboardEmptyState } from "@/app/daa/dashboard/_components/DashboardFeedback";
import {
  TradesErrorState,
  TradesHeader,
  TradesLedgerSummary,
  TradesSummaryMetrics,
  TradesTabsPanel,
} from "@/app/daa/dashboard/trades/_components/TradesSections";

export default function TradesPageClient() {
  const model = useTradesModel();

  if (model.loading) {
    return (
      <div className="space-y-6 lg:space-y-7">
        <TradesHeader model={model} />
        <DashboardEmptyState
          title="正在加载交易审计…"
          description="正在读取账本窗口、订单与周期历史，加载完成前不会先显示默认 0 值。"
          className="px-5 py-16"
        />
        <TradesErrorState error={model.error} />
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <TradesHeader model={model} />
      <TradesSummaryMetrics model={model} />
      <TradesLedgerSummary model={model} />
      <TradesErrorState error={model.error} />
      <TradesTabsPanel model={model} />
    </div>
  );
}
