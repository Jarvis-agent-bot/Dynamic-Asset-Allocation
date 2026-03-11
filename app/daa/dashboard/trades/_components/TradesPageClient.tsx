"use client";

import { useTradesModelV1 } from "@/app/daa/dashboard/_hooks/useTradesModelV1";
import {
  TradesErrorStateV1,
  TradesHeaderV1,
  TradesSummaryMetricsV1,
  TradesTabsPanelV1,
} from "@/app/daa/dashboard/trades/_components/TradesSectionsV1";

export default function TradesPageClient() {
  const model = useTradesModelV1();

  return (
    <div className="space-y-6 lg:space-y-7">
      <TradesHeaderV1 model={model} />
      <TradesSummaryMetricsV1 model={model} />
      <TradesErrorStateV1 error={model.error} />
      <TradesTabsPanelV1 model={model} />
    </div>
  );
}
