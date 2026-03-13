"use client";

import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { WorkbenchActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchActiveTabPanel";
import { WorkbenchBannerStack } from "@/app/daa/dashboard/workbench/_components/WorkbenchBannerStack";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { WorkbenchSummaryHeader } from "@/app/daa/dashboard/workbench/_components/WorkbenchSummaryHeader";

export default function WorkbenchPageClient(props: {
  initialTab?: string;
}) {
  const model = useWorkbenchPageModel({ initialTab: props.initialTab });

  return (
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
        cashValue={model.cashValue}
        loading={model.loading && !model.bootstrap}
        refreshing={model.refreshing}
        onRefresh={() => void model.loadBootstrap(true)}
      />

      {model.bootstrap ? <WorkbenchActiveTabPanel model={model} /> : null}

      <WorkbenchDialogs {...model.dialogProps} />
    </div>
  );
}
