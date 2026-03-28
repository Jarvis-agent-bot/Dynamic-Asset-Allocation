"use client";

import { useMemo } from "react";

import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

import { WorkbenchNotificationBar } from "@/app/daa/dashboard/workbench/_components/WorkbenchNotificationBar";
import { WorkbenchMarketIntel } from "@/app/daa/dashboard/workbench/_components/WorkbenchMarketIntel";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { ActionWorkflow } from "@/app/daa/dashboard/today/_components/workflow/ActionWorkflow";

export default function RebalancePageClient() {
  const wbModel = useWorkbenchPageModel();

  const driftCount = useMemo(() => {
    const threshold = (wbModel.bootstrap?.rebalanceStrategy?.drift?.thresholdPct ?? 0.05) * 100;
    return wbModel.tableProps.rows.filter(
      (r) => r.watchEnabled && r.targetWeightHint > 0 && r.gapPct != null && Math.abs(r.gapPct) > threshold,
    ).length;
  }, [wbModel.tableProps.rows, wbModel.bootstrap?.rebalanceStrategy?.drift?.thresholdPct]);

  return (
    <div className="space-y-4">
      <WorkbenchNotificationBar
        error={wbModel.error}
        authRequired={wbModel.authRequired}
        bootstrap={wbModel.bootstrap}
        executionReceipt={wbModel.executionReceipt}
        onClearExecutionReceipt={wbModel.clearExecutionReceipt}
        currentCycle={wbModel.rebalanceSectionProps?.currentCycle ?? null}
        warnings={wbModel.bootstrap?.warnings || []}
      />

      {wbModel.bootstrap && wbModel.rebalanceSectionProps ? (
        <SectionErrorBoundary sectionName="调仓工作流">
          <ActionWorkflow
            {...wbModel.rebalanceSectionProps}
            driftCount={driftCount}
          />
        </SectionErrorBoundary>
      ) : null}

      {/* 市场情报（调仓时看市场环境） */}
      {wbModel.bootstrap ? (
        <SectionErrorBoundary sectionName="市场情报">
          <WorkbenchMarketIntel
            marketContext={wbModel.bootstrap.marketContext ?? null}
            signals={wbModel.signals || []}
            currentCycle={wbModel.rebalanceSectionProps?.currentCycle ?? null}
          />
        </SectionErrorBoundary>
      ) : null}

      <WorkbenchDialogs {...wbModel.dialogProps} />
    </div>
  );
}
