"use client";

import { useWorkbenchPageModelV1 } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModelV1";
import { WorkbenchActiveTabPanelV1 } from "@/app/daa/dashboard/workbench/_components/WorkbenchActiveTabPanelV1";
import { WorkbenchBannerStackV1 } from "@/app/daa/dashboard/workbench/_components/WorkbenchBannerStackV1";
import { WorkbenchDialogsV1 } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogsV1";
import { WorkbenchSummaryHeaderV1 } from "@/app/daa/dashboard/workbench/_components/WorkbenchSummaryHeaderV1";

export default function WorkbenchPageClient(props: {
  initialTab?: string;
}) {
  const model = useWorkbenchPageModelV1({ initialTab: props.initialTab });

  return (
    <div className="space-y-4">
      <WorkbenchBannerStackV1
        error={model.error}
        authRequired={model.authRequired}
        bootstrap={model.bootstrap}
        executionReceipt={model.executionReceipt}
        onClearExecutionReceipt={model.clearExecutionReceipt}
      />

      <WorkbenchSummaryHeaderV1
        baseCurrency={model.bootstrap?.baseCurrency || "USD"}
        totalEquity={model.totalEquity}
        holdingsValue={model.holdingsValue}
        cashValue={model.cashValue}
        loading={model.loading && !model.bootstrap}
        refreshing={model.refreshing}
        onRefresh={() => void model.loadBootstrap(true)}
      />

      {model.bootstrap ? <WorkbenchActiveTabPanelV1 model={model} /> : null}

      <WorkbenchDialogsV1 {...model.dialogProps} />
    </div>
  );
}
