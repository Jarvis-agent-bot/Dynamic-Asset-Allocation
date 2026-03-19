"use client";

import { useTradesModel } from "@/app/daa/dashboard/_hooks/useTradesModel";
import {
  TradesErrorState,
  TradesHeader,
  TradesLedgerSummary,
  TradesSummaryMetrics,
  TradesTabsPanel,
} from "@/app/daa/dashboard/trades/_components/TradesSections";

export default function TradesPageClient() {
  const model = useTradesModel();

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
