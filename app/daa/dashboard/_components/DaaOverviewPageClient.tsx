"use client";

import { usePortfolioOverviewModelV1 } from "@/app/daa/dashboard/_hooks/usePortfolioOverviewModelV1";
import {
  OverviewAlertsPanelV1,
  OverviewAllocationPanelV1,
  OverviewCashLedgerDialogV1,
  OverviewCashLedgerPanelV1,
  OverviewEquityTrendPanelV1,
  OverviewErrorStateV1,
  OverviewMarketTemperaturePanelV1,
  OverviewRunSummaryPanelV1,
  OverviewSummaryHeaderV1,
} from "@/app/daa/dashboard/_components/overview/OverviewSectionsV1";

export default function DaaOverviewPageClient() {
  const model = usePortfolioOverviewModelV1();

  return (
    <div className="space-y-6 lg:space-y-7">
      <OverviewSummaryHeaderV1 model={model} />
      <OverviewErrorStateV1 error={model.error} />
      <OverviewRunSummaryPanelV1 model={model} />
      <OverviewMarketTemperaturePanelV1 model={model} />
      <OverviewAlertsPanelV1 model={model} />
      <OverviewEquityTrendPanelV1 model={model} />
      <OverviewAllocationPanelV1 model={model} />
      <OverviewCashLedgerPanelV1 model={model} />
      <OverviewCashLedgerDialogV1 model={model} />
    </div>
  );
}
