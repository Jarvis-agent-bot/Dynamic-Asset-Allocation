"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Gauge, ListChecks, ShieldCheck, WalletCards } from "lucide-react";

import { useAssetWorkbenchModel } from "@/app/daa/dashboard/_hooks/useAssetWorkbenchModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { DaaSurfacePanel, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";
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

import { WorkbenchNotificationBar } from "@/app/daa/dashboard/_shared/WorkbenchNotificationBar";
import { WorkbenchDialogs } from "@/app/daa/dashboard/_shared/WorkbenchDialogs";
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
    loading: () => <div className="h-32 rounded-[var(--radius-md)] bg-[var(--surface)]" />,
  },
);

function RebalanceLoadingState() {
  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.94fr)] xl:items-center">
          <div className="space-y-3">
            <div className="h-5 w-28 animate-pulse rounded-[var(--radius-sm)] bg-[var(--border)]" />
            <div className="h-8 w-72 max-w-full animate-pulse rounded bg-[var(--border)]" />
            <div className="h-4 w-[36rem] max-w-full animate-pulse rounded bg-[var(--border)]" />
            <div className="h-11 w-full animate-pulse rounded-[var(--radius-md)] bg-[var(--card)]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface)]" />
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.7fr)]">
        <div className="h-72 animate-pulse rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]" />
        <div className="h-72 animate-pulse rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]" />
      </div>
      <DaaSurfacePanel title="漂移概览" subtitle="同步持仓和目标权重。" accent="neutral">
        <SkeletonChart height={150} />
      </DaaSurfacePanel>
    </div>
  );
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
          <div className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">{props.label}</div>
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
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,0.94fr)] xl:items-center">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DaaSurfaceStatusPill tone={decision.tone}>本轮结论</DaaSurfaceStatusPill>
            <DaaSurfaceStatusPill tone={props.priceStreamConnected ? "success" : "neutral"}>
              {props.priceStreamConnected ? "实时价格" : "价格离线"}
            </DaaSurfaceStatusPill>
            {cycle ? (
              <span className="font-[var(--font-mono)] text-xs text-[var(--faint)]">
                {cycle.cycleId.slice(0, 8)} · {formatSnapshotTime(cycle.snapshotAt)}
              </span>
            ) : null}
          </div>
          <div>
            <h2 className="text-[26px] font-semibold leading-tight text-[var(--text)]">
              {decision.title}
            </h2>
            <p className="mt-1.5 line-clamp-2 max-w-3xl text-xs leading-5 text-[var(--muted)]">{decision.description}</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium text-[var(--text)]">
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
            icon={<Gauge className="h-4 w-4" />}
          />
        </div>
      </div>
    </section>
  );
}

function RebalanceActionRail(props: {
  bootstrap: WorkbenchBootstrap;
  rebalanceModel: NonNullable<ReturnType<typeof useAssetWorkbenchModel>["rebalanceSectionProps"]>;
}) {
  const selectedProposalKeys = props.rebalanceModel.currentCycle?.proposals
    .filter((proposal) => proposal.selected)
    .map((proposal) => `${proposal.assetKey}-${proposal.side}`) ?? [];

  return (
    <div className="space-y-3 xl:sticky xl:top-4">
      <ExecutionPanel
        currentCycle={props.rebalanceModel.currentCycle}
        currentRiskCheck={props.rebalanceModel.currentRiskCheck}
        baseCurrency={props.bootstrap.baseCurrency}
        busy={props.rebalanceModel.busy}
        selectedProposalCount={props.rebalanceModel.selectedProposalCount}
        selectedProposalNotional={props.rebalanceModel.selectedProposalNotional}
        canExecuteAll={props.rebalanceModel.canExecuteAll}
        canExecuteSelected={props.rebalanceModel.canExecuteSelected}
        isCurrentCycleTerminal={props.rebalanceModel.isCurrentCycleTerminal}
        rebalanceChecklistAllPassed={props.rebalanceModel.rebalanceChecklistAllPassed}
        compact
        onGenerateCycle={props.rebalanceModel.onGenerateCycle}
        onOpenExecuteDialog={props.rebalanceModel.onOpenExecuteDialog}
        onCancelCycle={props.rebalanceModel.onCancelCycle}
      />
      {props.rebalanceModel.selectedProposalCount > 0 && props.rebalanceModel.currentCycle ? (
        <SectionErrorBoundary sectionName="执行预览">
          <LazyWhatIfPreview
            cycleId={props.rebalanceModel.currentCycle.cycleId}
            selectedProposalKeys={selectedProposalKeys}
            baseCurrency={props.bootstrap.baseCurrency}
            embedded
          />
        </SectionErrorBoundary>
      ) : null}
    </div>
  );
}

export default function RebalancePageClient() {
  const assetWorkbenchModel = useAssetWorkbenchModel();
  const searchParams = useSearchParams();
  const appliedCycleIdRef = useRef<string | null>(null);

  useEffect(() => {
    const cycleId = searchParams.get("cycleId");
    if (!cycleId || !assetWorkbenchModel.rebalanceSectionProps) return;
    if (appliedCycleIdRef.current === cycleId) return;
    const match = assetWorkbenchModel.rebalanceSectionProps.cycles.find((cycleOption) => cycleOption.cycleId === cycleId);
    if (match) {
      appliedCycleIdRef.current = cycleId;
      assetWorkbenchModel.rebalanceSectionProps.onSelectCycle(match);
    }
  }, [searchParams, assetWorkbenchModel.rebalanceSectionProps]);

  const driftCount = useMemo(() => {
    const driftThresholdPct = (assetWorkbenchModel.bootstrap?.policy?.drift?.outerBandPct ?? 0.05) * 100;
    return assetWorkbenchModel.tableProps.rows.filter(
      (assetRow) => assetRow.watchEnabled && assetRow.targetWeightHint > 0 && assetRow.gapPct != null && Math.abs(assetRow.gapPct) > driftThresholdPct,
    ).length;
  }, [assetWorkbenchModel.tableProps.rows, assetWorkbenchModel.bootstrap?.policy?.drift?.outerBandPct]);

  const rebalanceModel = assetWorkbenchModel.rebalanceSectionProps;

  const cycle = rebalanceModel?.currentCycle ?? null;
  const policyDecision = cycle?.policySnapshot?.decision ?? null;

  return (
    <div className="space-y-4">
      <WorkbenchNotificationBar
        error={assetWorkbenchModel.error}
        authRequired={assetWorkbenchModel.authRequired}
        bootstrap={assetWorkbenchModel.bootstrap}
        executionReceipt={assetWorkbenchModel.executionReceipt}
        onClearExecutionReceipt={assetWorkbenchModel.clearExecutionReceipt}
        currentCycle={rebalanceModel?.currentCycle ?? null}
        warnings={assetWorkbenchModel.bootstrap?.warnings || []}
      />

      {/* ── 两栏决策区域 ── */}
      {assetWorkbenchModel.bootstrap && rebalanceModel ? (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <Gauge className="h-4 w-4 text-[var(--primary)]" />
                调仓工作台
              </div>
              <QuickConfigPopover
                driftThresholdPct={assetWorkbenchModel.bootstrap.policy?.drift?.outerBandPct}
                onSaved={() => void assetWorkbenchModel.loadBootstrap(true)}
              />
            </div>
            <RebalanceDecisionSummary
              bootstrap={assetWorkbenchModel.bootstrap}
              cycle={cycle}
              riskCheck={rebalanceModel.currentRiskCheck}
              policyDecision={policyDecision}
              selectedProposalCount={rebalanceModel.selectedProposalCount}
              selectedProposalNotional={rebalanceModel.selectedProposalNotional}
              buyProposalCount={rebalanceModel.buyProposalCount}
              sellProposalCount={rebalanceModel.sellProposalCount}
              canExecuteSelected={rebalanceModel.canExecuteSelected}
              isCurrentCycleTerminal={rebalanceModel.isCurrentCycleTerminal}
              priceStreamConnected={assetWorkbenchModel.priceStreamConnected}
            />
          </div>

          <SectionErrorBoundary sectionName="调仓建议">
            <RebalanceProposalList
              bootstrap={assetWorkbenchModel.bootstrap}
              currentCycle={rebalanceModel.currentCycle}
              currentRiskCheck={rebalanceModel.currentRiskCheck}
              busy={rebalanceModel.busy}
              isCurrentCycleTerminal={rebalanceModel.isCurrentCycleTerminal}
              canEditCurrentCycle={rebalanceModel.canEditCurrentCycle}
              buyProposalCount={rebalanceModel.buyProposalCount}
              sellProposalCount={rebalanceModel.sellProposalCount}
              selectedProposalNotional={rebalanceModel.selectedProposalNotional}
              expandedProposalDecisionKeys={rebalanceModel.expandedProposalDecisionKeys}
              setExpandedProposalDecisionKeys={rebalanceModel.setExpandedProposalDecisionKeys}
              onSelectAllProposals={rebalanceModel.onSelectAllProposals}
              onToggleProposal={rebalanceModel.onToggleProposal}
              sideContent={<RebalanceActionRail bootstrap={assetWorkbenchModel.bootstrap} rebalanceModel={rebalanceModel} />}
            />
          </SectionErrorBoundary>

          {/* ── 市场环境与预算依据（默认展开，便于审阅建议来源） ── */}
          {assetWorkbenchModel.bootstrap.marketContext ? (
            <SectionErrorBoundary sectionName="市场环境">
              <RebalanceMarketStrip
                marketContext={assetWorkbenchModel.bootstrap.marketContext}
                driftCount={driftCount}
                driftContent={(
                  <SectionErrorBoundary sectionName="组合偏离">
                    <LazyDriftBarChart
                      rows={assetWorkbenchModel.tableProps.rows}
                      driftThresholdPct={(assetWorkbenchModel.bootstrap.policy?.drift?.outerBandPct ?? 0.05) * 100}
                      maxItems={12}
                    />
                  </SectionErrorBoundary>
                )}
              />
            </SectionErrorBoundary>
          ) : (
            <SectionErrorBoundary sectionName="组合偏离">
              <DaaSurfacePanel
                title="组合偏离"
                subtitle="当前权重相对目标。"
                accent={driftCount > 0 ? "warning" : "success"}
                action={(
                  <DaaSurfaceStatusPill tone={driftCount > 0 ? "warning" : "success"}>
                    {driftCount > 0 ? `${driftCount} 项超阈值` : "目标内"}
                  </DaaSurfaceStatusPill>
                )}
              >
                <LazyDriftBarChart
                  rows={assetWorkbenchModel.tableProps.rows}
                  driftThresholdPct={(assetWorkbenchModel.bootstrap.policy?.drift?.outerBandPct ?? 0.05) * 100}
                  maxItems={12}
                />
              </DaaSurfacePanel>
            </SectionErrorBoundary>
          )}
        </>
      ) : (
        <RebalanceLoadingState />
      )}

      <WorkbenchDialogs {...assetWorkbenchModel.dialogProps} />
    </div>
  );
}
