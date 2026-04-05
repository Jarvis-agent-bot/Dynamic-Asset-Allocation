"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, RefreshCw } from "lucide-react";

import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { useTodayDecision } from "@/app/daa/dashboard/_hooks/useTodayDecision";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";

import { DashboardNotificationBar } from "@/app/daa/dashboard/workbench/_components/DashboardNotificationBar";
import { DashboardDialogs } from "@/app/daa/dashboard/workbench/_components/DashboardDialogs";
import { RebalanceProposalList } from "@/app/daa/dashboard/workbench/_components/rebalance/RebalanceProposalList";
import { WhatIfPreview } from "@/app/daa/dashboard/workbench/_components/rebalance/WhatIfPreview";
import { DriftBarChart } from "@/app/daa/dashboard/workbench/_components/rebalance/DriftBarChart";
import { RebalanceCycleHistory } from "@/app/daa/dashboard/workbench/_components/rebalance/RebalanceCycleHistory";

import { QuickConfigPopover } from "./QuickConfigPopover";
import { MarketContextCard } from "./MarketContextCard";
import { ExecutionPanel } from "./ExecutionPanel";

export default function RebalancePageClient() {
  const wbModel = useDashboardPageModel();
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

  const rp = wbModel.rebalanceSectionProps;

  // AI snapshot from today decision or cycle LLM snapshot
  const aiSnapshot = useMemo(() => {
    const llm = today.model?.llmOutput;
    const cycleSnapshot = rp?.currentCycle?.llmDecisionSnapshot;

    // 优先用 cycle 的 LLM snapshot（包含完整分析），回退到 today decision
    if (cycleSnapshot) {
      return {
        summary: cycleSnapshot.summary ?? undefined,
        reasoning: cycleSnapshot.reasoning ?? undefined,
        keyRisks: cycleSnapshot.keyRisks ?? undefined,
        keyOpportunities: cycleSnapshot.keyOpportunities ?? undefined,
        cashAdvice: cycleSnapshot.cashAdvice ?? undefined,
        cashRationale: cycleSnapshot.cashRationale ?? undefined,
        overallConfidence: cycleSnapshot.overallConfidence ?? undefined,
      };
    }

    if (!llm) return null;
    return {
      summary: llm.reason || undefined,
      keyRisks: llm.riskWarning ? [llm.riskWarning] : undefined,
      keyOpportunities: llm.dissent ? [llm.dissent] : undefined,
    };
  }, [today.model?.llmOutput, rp?.currentCycle?.llmDecisionSnapshot]);

  return (
    <div className="space-y-4">
      <DashboardNotificationBar
        error={wbModel.error}
        authRequired={wbModel.authRequired}
        bootstrap={wbModel.bootstrap}
        executionReceipt={wbModel.executionReceipt}
        onClearExecutionReceipt={wbModel.clearExecutionReceipt}
        currentCycle={rp?.currentCycle ?? null}
        warnings={wbModel.bootstrap?.warnings || []}
      />

      {/* 顶部工具栏：AI 状态 + 刷新 + 快速配置 */}
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-sm text-[var(--muted)]">AI 决策</span>
          {today.model && (
            <DaaSurfaceStatusPill tone={today.model.isStale ? "amber" : "green"}>
              {today.model.isStale ? "待刷新" : "已就绪"}
            </DaaSurfaceStatusPill>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void today.handleRefresh()}
            disabled={today.refreshing}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:opacity-50"
            title="刷新 AI 分析"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${today.refreshing ? "animate-spin" : ""}`} />
          </button>
          <QuickConfigPopover driftThresholdPct={wbModel.bootstrap?.rebalanceStrategy?.drift?.thresholdPct} />
        </div>
      </div>

      {/* 两栏主体 */}
      {wbModel.bootstrap && rp ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* 左侧：市场环境 + 漂移概览 + 提案列表 */}
          <div className="space-y-4">
            <SectionErrorBoundary sectionName="市场环境">
              <MarketContextCard
                marketContext={wbModel.bootstrap.marketContext ?? null}
                aiSnapshot={aiSnapshot}
              />
            </SectionErrorBoundary>

            {driftCount > 0 ? (
              <SectionErrorBoundary sectionName="漂移概览">
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">
                    漂移概览 ({driftCount} 项超阈值)
                  </div>
                  <DriftBarChart
                    rows={wbModel.tableProps.rows}
                    thresholdPct={(wbModel.bootstrap.rebalanceStrategy?.drift?.thresholdPct ?? 0.05) * 100}
                    maxItems={8}
                  />
                </div>
              </SectionErrorBoundary>
            ) : null}

            <SectionErrorBoundary sectionName="调仓建议">
              <RebalanceProposalList
                bootstrap={wbModel.bootstrap}
                currentCycle={rp.currentCycle}
                currentRiskCheck={rp.currentRiskCheck}
                busy={rp.busy}
                isCurrentCycleTerminal={rp.isCurrentCycleTerminal}
                canEditCurrentCycle={rp.canEditCurrentCycle}
                buyProposalCount={rp.buyProposalCount}
                sellProposalCount={rp.sellProposalCount}
                selectedProposalNotional={rp.selectedProposalNotional}
                expandedProposalDecisionKeys={rp.expandedProposalDecisionKeys}
                setExpandedProposalDecisionKeys={rp.setExpandedProposalDecisionKeys}
                llmFeedbackSubmittingByContext={rp.llmFeedbackSubmittingByContext}
                llmFeedbackScoreByContext={rp.llmFeedbackScoreByContext}
                onSelectAllProposals={rp.onSelectAllProposals}
                onToggleProposal={rp.onToggleProposal}
                onSubmitLlmFeedback={rp.onSubmitLlmFeedback}
              />
            </SectionErrorBoundary>
          </div>

          {/* 右侧：执行面板 + What-If + 漂移 + 历史 */}
          <div className="space-y-4">
            <ExecutionPanel
              currentCycle={rp.currentCycle}
              currentRiskCheck={rp.currentRiskCheck}
              baseCurrency={wbModel.bootstrap.baseCurrency}
              busy={rp.busy}
              selectedProposalCount={rp.selectedProposalCount}
              selectedProposalNotional={rp.selectedProposalNotional}
              canExecuteAll={rp.canExecuteAll}
              canExecuteSelected={rp.canExecuteSelected}
              isCurrentCycleTerminal={rp.isCurrentCycleTerminal}
              rebalanceChecklistAllPassed={rp.rebalanceChecklistAllPassed}
              onGenerateCycle={rp.onGenerateCycle}
              onOpenExecuteDialog={rp.onOpenExecuteDialog}
              onCancelCycle={rp.onCancelCycle}
            />

            {rp.selectedProposalCount > 0 && rp.currentCycle ? (
              <SectionErrorBoundary sectionName="执行预览">
                <WhatIfPreview
                  holdings={wbModel.tableProps.rows.filter((r) => r.holdingQty > 0).map((r) => ({
                    assetKey: r.assetKey,
                    symbol: r.symbol,
                    holdingQty: r.holdingQty,
                    lastPrice: r.lastPrice,
                    actualWeightPct: r.actualWeightPct ?? 0,
                    fxRateToBase: r.fxRateToBase,
                  }))}
                  proposals={rp.currentCycle.proposals ?? []}
                  cash={wbModel.bootstrap.account.cash}
                  baseCurrency={wbModel.bootstrap.baseCurrency}
                />
              </SectionErrorBoundary>
            ) : null}

            <SectionErrorBoundary sectionName="历史周期">
              <RebalanceCycleHistory
                cycles={rp.cycles}
                currentCycleId={rp.currentCycle?.cycleId ?? null}
                onSelectCycle={rp.onSelectCycle}
              />
            </SectionErrorBoundary>
          </div>
        </div>
      ) : null}

      <DashboardDialogs {...wbModel.dialogProps} />
    </div>
  );
}
