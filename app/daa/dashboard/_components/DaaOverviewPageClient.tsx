"use client";

import { usePortfolioOverviewModel } from "@/app/daa/dashboard/_hooks/usePortfolioOverviewModel";
import {
  OverviewAlertsPanel,
  OverviewAllocationPanel,
  OverviewCashLedgerPanel,
  OverviewEquityTrendPanel,
  OverviewErrorState,
  OverviewMarketTemperaturePanel,
  OverviewRunSummaryPanel,
  OverviewSummaryHeader,
} from "@/app/daa/dashboard/_components/overview/OverviewSections";

export default function DaaOverviewPageClient() {
  const model = usePortfolioOverviewModel();

  return (
    <div className="space-y-6 lg:space-y-7">
      <OverviewSummaryHeader model={model} />
      <OverviewErrorState error={model.error} />
      <OverviewRunSummaryPanel model={model} />
      <OverviewMarketTemperaturePanel model={model} />
      <OverviewAlertsPanel model={model} />
      <OverviewEquityTrendPanel model={model} />
      <OverviewAllocationPanel model={model} />
      <OverviewCashLedgerPanel model={model} />
    </div>
  );
}
