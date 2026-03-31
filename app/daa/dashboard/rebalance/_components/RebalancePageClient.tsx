"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { useTodayDecision } from "@/app/daa/dashboard/_hooks/useTodayDecision";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

import { WorkbenchNotificationBar } from "@/app/daa/dashboard/workbench/_components/WorkbenchNotificationBar";
import { WorkbenchMarketIntel } from "@/app/daa/dashboard/workbench/_components/WorkbenchMarketIntel";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { ActionWorkflow } from "@/app/daa/dashboard/today/_components/workflow/ActionWorkflow";
import { TodayBrief } from "@/app/daa/dashboard/today/_components/TodayBrief";
import { QuickConfigPopover } from "./QuickConfigPopover";

export default function RebalancePageClient() {
  const wbModel = useWorkbenchPageModel();
  const today = useTodayDecision();
  const searchParams = useSearchParams();
  const appliedCycleIdRef = useRef<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);

  // 从 URL 参数中读取 cycleId 并自动选中对应周期
  useEffect(() => {
    const cycleId = searchParams.get("cycleId");
    if (!cycleId || !wbModel.rebalanceSectionProps) return;
    if (appliedCycleIdRef.current === cycleId) return;
    const match = wbModel.rebalanceSectionProps.cycles.find((c) => c.cycleId === cycleId);
    if (match) {
      appliedCycleIdRef.current = cycleId;
      wbModel.rebalanceSectionProps.onSelectCycle(match);
    }
  }, [searchParams, wbModel.rebalanceSectionProps]);

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

      {/* 快速调参 + AI 摘要 */}
      <div className="flex items-center justify-end">
        <QuickConfigPopover
          driftThresholdPct={wbModel.bootstrap?.rebalanceStrategy?.drift?.thresholdPct}
        />
      </div>

      {/* AI 投委会摘要（可折叠） */}
      <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)]">
        <button
          type="button"
          onClick={() => setBriefOpen(!briefOpen)}
          className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-[rgba(255,255,255,0.02)]"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text)]">AI 投委会摘要</span>
            {today.model?.llmOutput?.conclusion && (
              <span className="rounded-full bg-[rgba(56,189,248,0.12)] px-2 py-0.5 text-[10px] font-medium text-[var(--primary)]">
                {today.model.isStale ? "数据待刷新" : "已就绪"}
              </span>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-[var(--muted)] transition-transform duration-200 ${briefOpen ? "rotate-180" : ""}`}
          />
        </button>
        {briefOpen && (
          <div className="border-t border-[var(--border)] px-5 py-4">
            <TodayBrief
              model={today.model}
              loading={today.loading}
              refreshing={today.refreshing}
              error={today.error}
              onRefresh={today.handleRefresh}
              onDecision={today.handleDecision}
            />
          </div>
        )}
      </div>

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
