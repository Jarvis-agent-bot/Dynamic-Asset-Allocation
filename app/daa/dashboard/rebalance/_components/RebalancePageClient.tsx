"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, RefreshCw } from "lucide-react";

import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { useTodayDecision } from "@/app/daa/dashboard/_hooks/useTodayDecision";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";

import { WorkbenchNotificationBar } from "@/app/daa/dashboard/workbench/_components/WorkbenchNotificationBar";
import { WorkbenchMarketIntel } from "@/app/daa/dashboard/workbench/_components/WorkbenchMarketIntel";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { ActionWorkflow } from "@/app/daa/dashboard/today/_components/workflow/ActionWorkflow";
import { QuickConfigPopover } from "./QuickConfigPopover";

export default function RebalancePageClient() {
  const wbModel = useWorkbenchPageModel();
  const today = useTodayDecision();
  const searchParams = useSearchParams();
  const appliedCycleIdRef = useRef<string | null>(null);

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

      {/* AI 投委会摘要（紧凑横条）+ 快速调参 */}
      <div className="flex items-center gap-3 rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-3">
        <Bot className="h-4 w-4 shrink-0 text-[var(--primary)]" />
        <div className="min-w-0 flex-1">
          {today.loading ? (
            <span className="text-sm text-[var(--muted)]">加载 AI 决策中…</span>
          ) : today.model?.llmOutput?.reason ? (
            <span className="text-sm leading-5 text-[var(--text)] line-clamp-1">
              {today.model.llmOutput.reason}
            </span>
          ) : (
            <span className="text-sm text-[var(--faint)]">AI 决策分析暂不可用</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {today.model && (
            <DaaSurfaceStatusPill tone={today.model.isStale ? "amber" : "green"}>
              {today.model.isStale ? "待刷新" : "已就绪"}
            </DaaSurfaceStatusPill>
          )}
          <button
            onClick={() => void today.handleRefresh()}
            disabled={today.refreshing}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:opacity-50"
            title="刷新 AI 分析"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${today.refreshing ? "animate-spin" : ""}`} />
          </button>
          <QuickConfigPopover
            driftThresholdPct={wbModel.bootstrap?.rebalanceStrategy?.drift?.thresholdPct}
          />
        </div>
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
