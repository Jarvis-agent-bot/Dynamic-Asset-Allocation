"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Gauge, ListChecks, ShieldCheck, WalletCards } from "lucide-react";

import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { DaaSurfacePanel, DaaSurfaceStatusPill, type DaaSurfaceTone } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import type { PolicyDecision } from "@/src/daa/modules/policy-engine/policyTypes";
import type { PreTradeRiskCheck } from "@/src/daa/modules/rebalance/rebalanceTypes";
import type { RebalanceCycle, WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

import { DashboardNotificationBar } from "@/app/daa/dashboard/_shared/DashboardNotificationBar";
import { DashboardDialogs } from "@/app/daa/dashboard/_shared/DashboardDialogs";
import { MarketIndicatorDashboard } from "@/app/daa/dashboard/_shared/MarketIndicatorDashboard";
import { RebalanceProposalList } from "@/app/daa/dashboard/_shared/rebalance/RebalanceProposalList";
import type { WhatIfPreviewProps } from "@/app/daa/dashboard/_shared/rebalance/WhatIfPreview";
import type { DriftBarChartProps } from "@/app/daa/dashboard/_shared/rebalance/DriftBarChart";
import {
  marketRegimeLabel,
  marketRegimeTone,
  riskStatusLabel,
} from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";

import { QuickConfigPopover } from "./QuickConfigPopover";
import { MarketContextCard } from "./MarketContextCard";
import { ExecutionPanel } from "./ExecutionPanel";

const LazyWhatIfPreview = dynamic<WhatIfPreviewProps>(
  () => import("@/app/daa/dashboard/_shared/rebalance/WhatIfPreview").then((mod) => mod.WhatIfPreview),
  {
    ssr: false,
    loading: () => null,
  },
);

const LazyDriftBarChart = dynamic<DriftBarChartProps>(
  () => import("@/app/daa/dashboard/_shared/rebalance/DriftBarChart").then((mod) => mod.DriftBarChart),
  {
    ssr: false,
    loading: () => <div className="h-32 rounded-[14px] bg-[rgba(255,255,255,0.03)]" />,
  },
);

function formatSnapshotTime(value: string | null | undefined) {
  if (!value) return "等待生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function DecisionMetric(props: {
  label: string;
  value: string;
  hint: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0 border-t border-[var(--border)] px-0 py-3 sm:border-l sm:border-t-0 sm:px-4 sm:py-0">
      <div className="flex items-start gap-2.5">
        {props.icon ? <div className="mt-0.5 text-[var(--muted)]">{props.icon}</div> : null}
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{props.label}</div>
          <div className="mt-1 truncate font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">{props.value}</div>
          <div className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">{props.hint}</div>
        </div>
      </div>
    </div>
  );
}

function policyActionLabel(action: string | null | undefined) {
  if (action === "authorize_auto_execute") return "可自动执行";
  if (action === "require_review") return "需要人工复核";
  if (action === "propose") return "生成建议";
  if (action === "observe") return "保持观察";
  if (action === "ignore") return "忽略噪声";
  return "等待决策";
}

function totalProposalNotional(cycle: RebalanceCycle | null): number {
  return (cycle?.proposals ?? []).reduce((sum, item) => sum + Math.max(0, item.suggestedNotional || 0), 0);
}

function buildDecisionState(input: {
  cycle: RebalanceCycle | null;
  riskCheck: PreTradeRiskCheck | null;
  selectedProposalCount: number;
  canExecuteSelected: boolean;
  isCurrentCycleTerminal: boolean;
}) {
  const { cycle, riskCheck, selectedProposalCount, canExecuteSelected, isCurrentCycleTerminal } = input;
  if (!cycle) {
    return {
      tone: "cyan" as DaaSurfaceTone,
      title: "等待生成本轮调仓建议",
      description: "先生成本轮建议，再审阅买卖清单、风控结果和执行影响。",
      nextStep: "下一步：在右侧执行面板生成本轮建议。",
    };
  }
  if (riskCheck?.overallStatus === "block") {
    return {
      tone: "red" as DaaSurfaceTone,
      title: "风控阻断，暂不应执行",
      description: riskCheck.items.find((item) => item.status === "block")?.message || "存在阻断项，需要先降低仓位或调整建议。",
      nextStep: "下一步：展开建议详情，处理阻断项后重新复核。",
    };
  }
  if (isCurrentCycleTerminal) {
    return {
      tone: cycle.status === "completed" ? "green" as DaaSurfaceTone : "slate" as DaaSurfaceTone,
      title: cycle.status === "completed" ? "本轮调仓已完成" : "本轮调仓已终止",
      description: cycle.status === "completed" ? "该周期已进入只读状态，可生成新一轮建议继续审阅。" : "该周期已取消或结束，建议生成新周期重新评估。",
      nextStep: "下一步：如需继续调仓，生成新一轮建议。",
    };
  }
  if ((cycle.proposals?.length ?? 0) === 0) {
    return {
      tone: "slate" as DaaSurfaceTone,
      title: "本轮没有可执行建议",
      description: cycle.triggerReason || "组合仍在目标范围内，或候选资产暂未满足金额、信念与风控条件。",
      nextStep: "下一步：查看下方证据，确认是否需要调整策略阈值。",
    };
  }
  if (selectedProposalCount > 0 && canExecuteSelected) {
    return {
      tone: "green" as DaaSurfaceTone,
      title: "已选建议可执行",
      description: "当前选中项已通过执行前检查，可以先执行选中项，保留其余建议继续观察。",
      nextStep: "下一步：在右侧执行面板执行选中建议。",
    };
  }
  return {
    tone: "amber" as DaaSurfaceTone,
    title: "建议待审阅",
    description: cycle.triggerReason || "本轮已生成买卖建议，请先确认理由、金额和冲突标记。",
    nextStep: "下一步：勾选要执行的建议，或按买入/卖出快速筛选。",
  };
}

function RebalanceDecisionSummary(props: {
  bootstrap: WorkbenchBootstrap;
  cycle: RebalanceCycle | null;
  riskCheck: PreTradeRiskCheck | null;
  policyDecision: PolicyDecision | null;
  selectedProposalCount: number;
  selectedProposalNotional: number;
  buyProposalCount: number;
  sellProposalCount: number;
  canExecuteSelected: boolean;
  isCurrentCycleTerminal: boolean;
  priceStreamConnected: boolean;
}) {
  const cycle = props.cycle;
  const allProposalNotional = totalProposalNotional(cycle);
  const decision = buildDecisionState({
    cycle,
    riskCheck: props.riskCheck,
    selectedProposalCount: props.selectedProposalCount,
    canExecuteSelected: props.canExecuteSelected,
    isCurrentCycleTerminal: props.isCurrentCycleTerminal,
  });

  return (
    <section className="rounded-[16px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.9),rgba(8,12,20,0.94))] p-4 shadow-[0_18px_38px_rgba(0,0,0,0.22)]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.94fr)] xl:items-center">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DaaSurfaceStatusPill tone={decision.tone}>本轮结论</DaaSurfaceStatusPill>
            <DaaSurfaceStatusPill tone={props.priceStreamConnected ? "green" : "slate"}>
              {props.priceStreamConnected ? "实时价格" : "价格离线"}
            </DaaSurfaceStatusPill>
            {cycle ? (
              <span className="font-[var(--font-mono)] text-xs text-[var(--faint)]">
                {cycle.cycleId.slice(0, 8)} · {formatSnapshotTime(cycle.snapshotAt)}
              </span>
            ) : null}
          </div>
          <div>
            <h2 className="font-[var(--font-display)] text-[28px] leading-tight tracking-[-0.02em] text-[var(--text)]">
              {decision.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{decision.description}</p>
          </div>
          <div className="rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.64)] px-4 py-3 text-sm font-medium text-[var(--text)]">
            {decision.nextStep}
          </div>
        </div>

        <div className="grid gap-0 sm:grid-cols-4">
          <DecisionMetric
            label="建议规模"
            value={cycle ? formatCurrency(allProposalNotional, props.bootstrap.baseCurrency) : "未生成"}
            hint={cycle ? `买入 ${props.buyProposalCount} · 卖出 ${props.sellProposalCount}` : "等待周期创建"}
            icon={<ListChecks className="h-4 w-4" />}
          />
          <DecisionMetric
            label="已选执行"
            value={props.selectedProposalCount > 0 ? formatCurrency(props.selectedProposalNotional, props.bootstrap.baseCurrency) : "未选择"}
            hint={props.selectedProposalCount > 0 ? `${props.selectedProposalCount} 条建议` : "先勾选建议"}
            icon={<WalletCards className="h-4 w-4" />}
          />
          <DecisionMetric
            label="风控"
            value={riskStatusLabel(props.riskCheck?.overallStatus ?? "pass")}
            hint={`${props.riskCheck?.items.filter((item) => item.status !== "pass").length ?? 0} 条提示`}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <DecisionMetric
            label="策略"
            value={policyActionLabel(props.policyDecision?.action)}
            hint={props.policyDecision ? `行动分 ${props.policyDecision.score.toFixed(1)} / ${props.policyDecision.threshold.toFixed(1)}` : "等待评估"}
            icon={<Bot className="h-4 w-4" />}
          />
        </div>
      </div>
    </section>
  );
}

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
    const threshold = (wbModel.bootstrap?.policy?.drift?.outerBandPct ?? 0.05) * 100;
    return wbModel.tableProps.rows.filter(
      (r) => r.watchEnabled && r.targetWeightHint > 0 && r.gapPct != null && Math.abs(r.gapPct) > threshold,
    ).length;
  }, [wbModel.tableProps.rows, wbModel.bootstrap?.policy?.drift?.outerBandPct]);

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

  const cycle = rp?.currentCycle ?? null;
  const policyDecision = cycle?.policySnapshot?.decision ?? null;

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

      {/* ── 两栏决策区域 ── */}
      {wbModel.bootstrap && rp ? (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Gauge className="h-4 w-4 text-[var(--primary)]" />
                调仓工作台
              </div>
              <QuickConfigPopover driftThresholdPct={wbModel.bootstrap.policy?.drift?.outerBandPct} />
            </div>
            <RebalanceDecisionSummary
              bootstrap={wbModel.bootstrap}
              cycle={cycle}
              riskCheck={rp.currentRiskCheck}
              policyDecision={policyDecision}
              selectedProposalCount={rp.selectedProposalCount}
              selectedProposalNotional={rp.selectedProposalNotional}
              buyProposalCount={rp.buyProposalCount}
              sellProposalCount={rp.sellProposalCount}
              canExecuteSelected={rp.canExecuteSelected}
              isCurrentCycleTerminal={rp.isCurrentCycleTerminal}
              priceStreamConnected={wbModel.priceStreamConnected}
            />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            {/* 左侧：提案列表 */}
            <div className="space-y-4">
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
                />
              </SectionErrorBoundary>
            </div>

            {/* 右侧：审阅与执行 */}
            <div className="space-y-4 xl:sticky xl:top-20">
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

              <SectionErrorBoundary sectionName="市场环境">
                <MarketContextCard
                  marketContext={wbModel.bootstrap.marketContext ?? null}
                  aiSnapshot={aiSnapshot}
                />
              </SectionErrorBoundary>

              <SectionErrorBoundary sectionName="漂移概览">
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">
                      漂移概览 ({driftCount} 项超阈值)
                    </div>
                    <DaaSurfaceStatusPill tone={driftCount > 0 ? "amber" : "green"}>
                      {driftCount > 0 ? "需要关注" : "目标内"}
                    </DaaSurfaceStatusPill>
                  </div>
                  <LazyDriftBarChart
                    rows={wbModel.tableProps.rows}
                    driftThresholdPct={(wbModel.bootstrap.policy?.drift?.outerBandPct ?? 0.05) * 100}
                    maxItems={8}
                  />
                </div>
              </SectionErrorBoundary>

              {rp.selectedProposalCount > 0 && rp.currentCycle ? (
                <SectionErrorBoundary sectionName="执行预览">
                  <LazyWhatIfPreview
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

          {/* ── 全宽：完整市场指标 ── */}
          {wbModel.bootstrap.marketContext ? (
            <SectionErrorBoundary sectionName="完整市场指标">
              <DaaSurfacePanel
                title="完整市场指标"
                subtitle="这些指标只解释当前环境是否适合加仓；真正买入或卖出哪只资产，以左侧建议清单为准。"
                accent={marketRegimeTone(wbModel.bootstrap.marketContext.regime)}
                action={(
                  <DaaSurfaceStatusPill tone={marketRegimeTone(wbModel.bootstrap.marketContext.regime)}>
                    {marketRegimeLabel(wbModel.bootstrap.marketContext.regime)}
                    {" · 风险分 "}
                    {wbModel.bootstrap.marketContext.riskOffScorePct.toFixed(0)}
                  </DaaSurfaceStatusPill>
                )}
              >
                <MarketIndicatorDashboard marketContext={wbModel.bootstrap.marketContext} hideClock />
              </DaaSurfacePanel>
            </SectionErrorBoundary>
          ) : null}
        </>
      ) : null}

      <DashboardDialogs {...wbModel.dialogProps} />
    </div>
  );
}
