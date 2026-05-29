"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Gauge, ListChecks, ShieldCheck, WalletCards } from "lucide-react";

import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { DaaSurfacePanel, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import type { PolicyDecision } from "@/src/daa/modules/policy-engine/policyTypes";
import type { PreTradeRiskCheck } from "@/src/daa/modules/rebalance/rebalanceTypes";
import type { RebalanceCycle, WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";
import {
  buildDecisionState,
  formatSnapshotTime,
  policyActionLabel,
  totalProposalNotional,
} from "./rebalanceDecisionState";

import { DashboardNotificationBar } from "@/app/daa/dashboard/_shared/DashboardNotificationBar";
import { DashboardDialogs } from "@/app/daa/dashboard/_shared/DashboardDialogs";
import { RebalanceProposalList } from "@/app/daa/dashboard/_shared/rebalance/RebalanceProposalList";
import type { WhatIfPreviewProps } from "@/app/daa/dashboard/_shared/rebalance/WhatIfPreview";
import type { DriftBarChartProps } from "@/app/daa/dashboard/_shared/rebalance/DriftBarChart";
import { riskStatusLabel } from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";

import { QuickConfigPopover } from "./QuickConfigPopover";
import { ExecutionPanel } from "./ExecutionPanel";
import { RebalanceMarketStrip } from "./RebalanceMarketStrip";

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
    policyDecision: props.policyDecision,
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
              sideContent={rp.selectedProposalCount > 0 && rp.currentCycle ? (
                <SectionErrorBoundary sectionName="执行预览">
                  <LazyWhatIfPreview
                    cycleId={rp.currentCycle.cycleId}
                    selectedProposalKeys={rp.currentCycle.proposals
                      .filter((p) => p.selected)
                      .map((p) => `${p.assetKey}-${p.side}`)}
                    baseCurrency={wbModel.bootstrap.baseCurrency}
                    embedded
                  />
                </SectionErrorBoundary>
              ) : undefined}
              afterContent={(
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
              )}
            />
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="漂移概览">
            <DaaSurfacePanel
              title="漂移概览"
              subtitle="按当前持仓与目标权重的偏离查看，超过策略阈值的项目会优先进入调仓审阅。"
              accent={driftCount > 0 ? "amber" : "green"}
              action={(
                <DaaSurfaceStatusPill tone={driftCount > 0 ? "amber" : "green"}>
                  {driftCount > 0 ? `${driftCount} 项超阈值` : "目标内"}
                </DaaSurfaceStatusPill>
              )}
            >
              <LazyDriftBarChart
                rows={wbModel.tableProps.rows}
                driftThresholdPct={(wbModel.bootstrap.policy?.drift?.outerBandPct ?? 0.05) * 100}
                maxItems={12}
              />
            </DaaSurfacePanel>
          </SectionErrorBoundary>

          {/* ── 市场环境（默认折叠的概览 + 可展开完整指标） ── */}
          {wbModel.bootstrap.marketContext ? (
            <SectionErrorBoundary sectionName="市场环境">
              <RebalanceMarketStrip marketContext={wbModel.bootstrap.marketContext} />
            </SectionErrorBoundary>
          ) : null}
        </>
      ) : null}

      <DashboardDialogs {...wbModel.dialogProps} />
    </div>
  );
}
