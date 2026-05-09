"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, CalendarClock, Gauge, ShieldCheck, WalletCards } from "lucide-react";

import { useDashboardPageModel } from "@/app/daa/dashboard/_hooks/useDashboardPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";

import { DashboardNotificationBar } from "@/app/daa/dashboard/_shared/DashboardNotificationBar";
import { DashboardDialogs } from "@/app/daa/dashboard/_shared/DashboardDialogs";
import { RebalanceProposalList } from "@/app/daa/dashboard/_shared/rebalance/RebalanceProposalList";
import { WhatIfPreview } from "@/app/daa/dashboard/_shared/rebalance/WhatIfPreview";
import { DriftBarChart } from "@/app/daa/dashboard/_shared/rebalance/DriftBarChart";
import {
  cycleStatusLabel,
  cycleStatusTone,
  marketRegimeLabel,
  marketRegimeTone,
  riskOverallTone,
  riskStatusLabel,
  triggerSourceLabel,
} from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";
// 历史周期已移至交易记录页
import { MarketIndicatorDashboard } from "@/app/daa/dashboard/_shared/MarketIndicatorDashboard";

import { QuickConfigPopover } from "./QuickConfigPopover";
import { MarketContextCard } from "./MarketContextCard";
import { ExecutionPanel } from "./ExecutionPanel";

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

function WorkbenchStatusCard(props: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone?: "cyan" | "green" | "amber" | "red" | "indigo" | "slate";
}) {
  const toneClass = props.tone === "green"
    ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
    : props.tone === "amber"
      ? "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]"
      : props.tone === "red"
        ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]"
        : props.tone === "indigo"
          ? "border-[var(--indigo-border)] bg-[var(--indigo-bg)] text-[var(--indigo)]"
          : "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]";
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(13,19,32,0.88)] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border ${toneClass}`}>
          {props.icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{props.label}</div>
          <div className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{props.value}</div>
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

function noTradeBandLabel(state: string | null | undefined) {
  if (state === "entered_outer") return "外圈";
  if (state === "cooling") return "冷静";
  if (state === "exited_inner") return "回归";
  if (state === "inside") return "内圈";
  return "未评估";
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

  const cycle = rp?.currentCycle ?? null;
  const policyDecision = cycle?.policySnapshot?.decision ?? null;
  const riskStatus = rp?.currentRiskCheck?.overallStatus ?? "pass";
  const statusCards = wbModel.bootstrap && rp ? [
    {
      label: "周期状态",
      value: cycle ? cycleStatusLabel(cycle.status) : "未生成",
      hint: cycle ? `${triggerSourceLabel(cycle.triggerSource)} · ${cycle.cycleId.slice(0, 8)}` : "生成后可审阅建议",
      icon: <Gauge className="h-4 w-4" />,
      tone: cycle ? cycleStatusTone(cycle.status) : "slate",
    },
    {
      label: "策略决策",
      value: policyActionLabel(policyDecision?.action),
      hint: policyDecision
        ? `行动分 ${policyDecision.score.toFixed(1)} / ${policyDecision.threshold.toFixed(1)} · ${noTradeBandLabel(policyDecision.noTradeBandState)}`
        : "等待 Policy Engine 评估",
      icon: <Bot className="h-4 w-4" />,
      tone: policyDecision?.action === "authorize_auto_execute" || policyDecision?.action === "propose"
        ? "green" as const
        : policyDecision?.blockers.length
          ? "amber" as const
          : "indigo" as const,
    },
    {
      label: "调仓时点",
      value: formatSnapshotTime(cycle?.snapshotAt),
      hint: cycle?.triggerReason || "等待触发原因",
      icon: <CalendarClock className="h-4 w-4" />,
      tone: "indigo" as const,
    },
    {
      label: "市场与风控",
      value: `${marketRegimeLabel(wbModel.bootstrap.marketContext?.regime)} / ${riskStatusLabel(riskStatus)}`,
      hint: `风险分 ${(wbModel.bootstrap.marketContext?.riskOffScorePct ?? 0).toFixed(0)} · ${rp.currentRiskCheck?.items.filter((item) => item.status !== "pass").length ?? 0} 条提示`,
      icon: <ShieldCheck className="h-4 w-4" />,
      tone: riskStatus === "pass" ? marketRegimeTone(wbModel.bootstrap.marketContext?.regime) : riskOverallTone(riskStatus),
    },
    {
      label: "执行范围",
      value: rp.selectedProposalCount > 0
        ? formatCurrency(rp.selectedProposalNotional, wbModel.bootstrap.baseCurrency)
        : `${cycle?.proposals.length ?? 0} 条建议`,
      hint: rp.selectedProposalCount > 0 ? `已选 ${rp.selectedProposalCount} 条` : `买入 ${rp.buyProposalCount} · 卖出 ${rp.sellProposalCount}`,
      icon: <WalletCards className="h-4 w-4" />,
      tone: rp.selectedProposalCount > 0 ? "green" as const : "cyan" as const,
    },
  ] : [];

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

      <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.52)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-[var(--primary)]" />
            <span className="text-sm font-semibold text-[var(--text)]">调仓工作台</span>
            <DaaSurfaceStatusPill tone={wbModel.priceStreamConnected ? "green" : "slate"}>
              {wbModel.priceStreamConnected ? "实时价格" : "价格离线"}
            </DaaSurfaceStatusPill>
          </div>
          <QuickConfigPopover driftThresholdPct={wbModel.bootstrap?.rebalanceStrategy?.drift?.thresholdPct} />
        </div>
        {statusCards.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {statusCards.map((card) => (
              <WorkbenchStatusCard key={card.label} {...card} />
            ))}
          </div>
        ) : null}
      </div>

      {/* ── 两栏决策区域 ── */}
      {wbModel.bootstrap && rp ? (
        <>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
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
                  onGenerateCycle={rp.onGenerateCycle}
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

          {/* ── 辅助证据区：市场环境 + 漂移分布 ── */}
          <div className="grid items-start gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
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
                <DriftBarChart
                  rows={wbModel.tableProps.rows}
                  thresholdPct={(wbModel.bootstrap.rebalanceStrategy?.drift?.thresholdPct ?? 0.05) * 100}
                  maxItems={8}
                />
              </div>
            </SectionErrorBoundary>
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
