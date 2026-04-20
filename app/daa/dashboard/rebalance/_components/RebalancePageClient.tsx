"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Bot } from "lucide-react";

import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";

import { DashboardNotificationBar } from "@/app/daa/dashboard/_shared/DashboardNotificationBar";
import { DashboardDialogs } from "@/app/daa/dashboard/_shared/DashboardDialogs";
import { RebalanceProposalList } from "@/app/daa/dashboard/_shared/rebalance/RebalanceProposalList";
import { WhatIfPreview } from "@/app/daa/dashboard/_shared/rebalance/WhatIfPreview";
import { DriftBarChart } from "@/app/daa/dashboard/_shared/rebalance/DriftBarChart";
// 历史周期已移至交易记录页
import { MarketIndicatorDashboard } from "@/app/daa/dashboard/_shared/MarketIndicatorDashboard";

import { QuickConfigPopover } from "./QuickConfigPopover";
import { MarketContextCard } from "./MarketContextCard";
import { ExecutionPanel } from "./ExecutionPanel";

export default function RebalancePageClient() {
  const wbModel = useDashboardPageModel();
  const searchParams = useSearchParams();
  const appliedCycleIdRef = useRef<string | null>(null);

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

  const aiSnapshot = useMemo(() => {
    const cycleSnapshot = rp?.currentCycle?.agentDecisionSnapshot;
    if (!cycleSnapshot) return null;
    return {
      summary: cycleSnapshot.summary ?? undefined,
      reasoning: cycleSnapshot.reasoning ?? undefined,
      keyRisks: cycleSnapshot.keyRisks ?? undefined,
      keyOpportunities: cycleSnapshot.keyOpportunities ?? undefined,
      cashAdvice: cycleSnapshot.cashAdvice ?? undefined,
      cashRationale: cycleSnapshot.cashRationale ?? undefined,
      overallConfidence: cycleSnapshot.overallConfidence ?? undefined,
    };
  }, [rp?.currentCycle?.agentDecisionSnapshot]);

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

      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-sm text-[var(--muted)]">AI 决策</span>
          <DaaSurfaceStatusPill tone={wbModel.priceStreamConnected ? "green" : "slate"}>
            {wbModel.priceStreamConnected ? "实时" : "离线"}
          </DaaSurfaceStatusPill>
        </div>
        <div className="flex items-center gap-2">
          <QuickConfigPopover driftThresholdPct={wbModel.bootstrap?.rebalanceStrategy?.drift?.thresholdPct} />
        </div>
      </div>

      {/* ── 两栏决策区域 ── */}
      {wbModel.bootstrap && rp ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* 左侧：市场环境 + 提案列表 */}
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
                  onSelectAllProposals={rp.onSelectAllProposals}
                  onToggleProposal={rp.onToggleProposal}
                  onGenerateCycle={rp.onGenerateCycle}
                />
              </SectionErrorBoundary>
            </div>

            {/* 右侧：执行面板 + What-If 预览 */}
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
                    cycleId={rp.currentCycle.cycleId}
                    selectedProposalKeys={rp.currentCycle.proposals
                      .filter((p) => p.selected)
                      .map((p) => `${p.assetKey}-${p.side}`)}
                    baseCurrency={wbModel.bootstrap.baseCurrency}
                  />
                </SectionErrorBoundary>
              ) : null}
            </div>
          </div>

          {/* ── 全宽：市场指标仪表盘（美林时钟 + 指标概览 + scope 分析） ── */}
          {wbModel.bootstrap.marketContext ? (
            <SectionErrorBoundary sectionName="市场指标">
              <MarketIndicatorDashboard
                marketContext={wbModel.bootstrap.marketContext}
              />
            </SectionErrorBoundary>
          ) : null}
        </>
      ) : null}

      <DashboardDialogs {...wbModel.dialogProps} />
    </div>
  );
}
