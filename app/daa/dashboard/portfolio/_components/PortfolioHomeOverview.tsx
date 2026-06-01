"use client";

import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Eye,
  Gauge,
  LineChart,
  PieChart,
  RefreshCcw,
  WalletCards,
} from "lucide-react";
import type { ComponentType } from "react";

import { useState } from "react";

import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { DaaSurfaceActionButton, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";
import type { AssetUniverseView, RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { PortfolioCashEntryPopover } from "./PortfolioCashEntryPopover";

const LazyPerformanceChart = dynamic(
  () => import("@/app/daa/dashboard/_shared/PerformanceChart").then((mod) => mod.PerformanceChart),
  {
    ssr: false,
    loading: () => <SkeletonChart />,
  },
);

type HomeAction = {
  label: string;
  hint: string;
  Icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  tone: "cyan" | "green" | "amber";
};

function isTerminalCycle(cycle: RebalanceCycle | null | undefined) {
  return cycle?.status === "completed" || cycle?.status === "cancelled";
}

function cycleStatusLabel(cycle: RebalanceCycle | null | undefined) {
  if (!cycle) return "未生成";
  if (cycle.status === "completed") return "已完成";
  if (cycle.status === "cancelled") return "已取消";
  if (cycle.status === "executing") return "执行中";
  return "待审阅";
}

function cycleStatusTone(cycle: RebalanceCycle | null | undefined) {
  if (!cycle) return "slate" as const;
  if (cycle.status === "completed") return "green" as const;
  if (cycle.status === "cancelled") return "slate" as const;
  return "amber" as const;
}

function resolvePrimaryAction(input: {
  totalEquity: number;
  latestCycle: RebalanceCycle | null | undefined;
  maxDriftPct: number;
  onDeposit: () => void;
  onOpenRebalance: () => void;
  onRefresh: () => void;
}): HomeAction {
  if (input.totalEquity <= 0) {
    return {
      label: "记录入金",
      hint: "让组合进入可配置状态",
      Icon: WalletCards,
      onClick: input.onDeposit,
      tone: "green",
    };
  }
  if (input.maxDriftPct >= 5) {
    return {
      label: "生成调仓建议",
      hint: `最大偏离 ${formatPercent(input.maxDriftPct)}，已超过策略阈值`,
      Icon: Gauge,
      onClick: input.onOpenRebalance,
      tone: "amber",
    };
  }
  if (input.latestCycle && !isTerminalCycle(input.latestCycle) && input.latestCycle.proposals.length > 0) {
    return {
      label: "审阅调仓建议",
      hint: `${input.latestCycle.proposals.length} 条建议等待确认`,
      Icon: Activity,
      onClick: input.onOpenRebalance,
      tone: "amber",
    };
  }
  return {
    label: "刷新组合状态",
    hint: "更新价格、现金与配置偏离",
    Icon: RefreshCcw,
    onClick: input.onRefresh,
    tone: "cyan",
  };
}

function toneClass(tone: HomeAction["tone"]) {
  if (tone === "green") return "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]";
  if (tone === "amber") return "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]";
  return "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]";
}

type TargetAllocationSnapshot = {
  agentRunId?: unknown;
  targetWeights?: Record<string, unknown> | null;
  baselineTargetWeights?: Record<string, unknown> | null;
  intentReasons?: Record<string, unknown> | null;
  summary?: unknown;
  reason?: unknown;
};

function getTargetAllocationSnapshot(cycle: RebalanceCycle | null | undefined): TargetAllocationSnapshot | null {
  const snapshot = cycle?.agentDecisionSnapshot as (RebalanceCycle["agentDecisionSnapshot"] & {
    targetAllocationPlan?: TargetAllocationSnapshot | null;
  }) | null | undefined;
  const plan = snapshot?.targetAllocationPlan;
  return plan && typeof plan === "object" ? plan : null;
}

function readPlanWeightPct(weights: Record<string, unknown> | null | undefined, assetKey: string): number | null {
  const raw = weights?.[assetKey.toUpperCase()];
  const value = Number(raw);
  return Number.isFinite(value) ? value * 100 : null;
}

function readIntentReason(plan: TargetAllocationSnapshot | null, assetKey: string): string | null {
  const raw = plan?.intentReasons?.[assetKey.toUpperCase()];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const reasoning = compactReason(record.reasoning, 120);
  const confidence = Number(record.confidence);
  if (!reasoning) return null;
  return Number.isFinite(confidence) ? `${reasoning}（置信 ${confidence.toFixed(0)}）` : reasoning;
}

function compactReason(text: unknown, maxLength = 96): string | null {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function resolveMaxDriftReason(input: {
  row: AssetUniverseView | undefined;
  latestCycle: RebalanceCycle | null | undefined;
}): string {
  if (!input.row) return "目标权重设置后会记录偏离来源。";

  const plan = getTargetAllocationSnapshot(input.latestCycle);
  const plannedPct = readPlanWeightPct(plan?.targetWeights, input.row.assetKey);
  const baselinePct = readPlanWeightPct(plan?.baselineTargetWeights, input.row.assetKey);
  if (plannedPct != null && Math.abs(plannedPct - input.row.targetWeightPct) <= 0.05) {
    const reason = readIntentReason(plan, input.row.assetKey) || compactReason(plan?.summary) || compactReason(plan?.reason);
    const baseline = baselinePct != null ? `原目标 ${formatPercent(baselinePct)} -> ` : "";
    return `${baseline}Agent 目标 ${formatPercent(plannedPct)}${reason ? `；${reason}` : ""}`;
  }

  const triggerReason = compactReason(input.latestCycle?.triggerReason, 120);
  if (triggerReason) return `最近周期记录：${triggerReason}`;

  return "当前只记录了目标权重数值，未找到对应的 Agent 或调仓周期原因。";
}

export function PortfolioHomeOverview(props: {
  baseCurrency: string;
  totalEquity: number;
  holdingsValue: number;
  availableCashValue: number;
  frozenCashValue: number;
  holdingCount: number;
  watchlistCount: number;
  rows: AssetUniverseView[];
  snapshots: Array<{ ts: string; totalEquity: number }>;
  cashFlowEvents?: Array<{ ts: string; side: "deposit" | "withdraw"; amount: number }>;
  equityDelta: { dayChange: number | null; dayChangePct: number | null; weekChange: number | null; weekChangePct: number | null } | null;
  latestCycle?: RebalanceCycle | null;
  refreshing: boolean;
  priceStreamConnected?: boolean;
  onRefresh: () => void;
  onCashRefresh: () => void;
  onOpenRebalance: () => void;
}) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const basketCount = props.rows.filter((row) => row.watchEnabled && row.targetWeightHint > 0).length;
  const investedRatio = props.totalEquity > 0 ? (props.holdingsValue / props.totalEquity) * 100 : 0;
  const cashRatio = props.totalEquity > 0 ? (props.availableCashValue / props.totalEquity) * 100 : 0;
  const latestCycleStatus = cycleStatusLabel(props.latestCycle);
  const allocationRows = props.rows
    .filter((row) => row.holdingQty > 0 || row.actualWeightPct > 0 || row.targetWeightHint > 0)
    .sort((a, b) => (b.actualWeightPct || b.targetWeightPct) - (a.actualWeightPct || a.targetWeightPct));
  const maxAllocationPct = Math.max(1, ...allocationRows.map((row) => row.actualWeightPct || row.targetWeightPct));
  const maxDriftRow = props.rows
    .filter((row) => row.gapPct != null)
    .sort((a, b) => Math.abs(b.gapPct ?? 0) - Math.abs(a.gapPct ?? 0))[0];
  const maxDriftPct = Math.abs(maxDriftRow?.gapPct ?? 0);
  const maxDriftReason = resolveMaxDriftReason({ row: maxDriftRow, latestCycle: props.latestCycle });
  const priceIssueCount = props.rows.filter((row) => row.priceStatus === "missing" || row.priceStatus === "stale").length;
  const primaryAction = resolvePrimaryAction({
    totalEquity: props.totalEquity,
    latestCycle: props.latestCycle,
    maxDriftPct,
    onDeposit: () => setDepositOpen(true),
    onOpenRebalance: props.onOpenRebalance,
    onRefresh: props.onRefresh,
  });

  const portfolioMetrics = [
    { label: "持仓", value: props.holdingCount, Icon: Briefcase },
    { label: "观察", value: props.watchlistCount, Icon: Eye },
    { label: "目标篮子", value: basketCount, Icon: LineChart },
  ];

  return (
    <section className="relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[linear-gradient(135deg,var(--card),var(--surface)_58%,var(--elevated))] shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--primary),var(--amber),transparent)]" />
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.42fr)]">
        <div className="border-b border-[var(--border)] p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                资产中枢 · 权益走势
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-2">
                <div className="font-[var(--font-mono)] text-[34px] leading-none tracking-[-0.03em] text-[var(--text)] sm:text-[42px]">
                  {formatCurrency(props.totalEquity, props.baseCurrency)}
                </div>
                <div className="pb-1 text-xs leading-5 text-[var(--muted)]">
                  持仓 {formatPercent(investedRatio)} · 现金 {formatPercent(cashRatio)}
                  {props.frozenCashValue > 0 ? ` · 冻结 ${formatCurrency(props.frozenCashValue, props.baseCurrency)}` : ""}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DaaSurfaceStatusPill tone={props.priceStreamConnected ? "green" : "slate"}>
                {props.priceStreamConnected ? "实时价格" : "价格离线"}
              </DaaSurfaceStatusPill>
              <DaaSurfaceStatusPill tone={cycleStatusTone(props.latestCycle)}>
                调仓 {latestCycleStatus}
              </DaaSurfaceStatusPill>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {portfolioMetrics.map((item) => (
              <div
                key={item.label}
                className="flex min-h-[86px] items-center justify-between rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <item.Icon className="h-4 w-4 text-[var(--primary)]" />
                    {item.label}
                  </div>
                  <div className="mt-2 font-[var(--font-mono)] text-2xl text-[var(--text)]">{item.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <LineChart className="h-4 w-4 text-[var(--primary)]" />
                  当前项目权益走势
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  默认显示收益率，并提供标普 500 / 纳斯达克 100 基准对比
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {props.equityDelta?.dayChangePct != null ? (
                  <span className={cn(
                    "rounded-full border px-2.5 py-1 font-[var(--font-mono)]",
                    props.equityDelta.dayChangePct >= 0
                      ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
                      : "border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.12)] text-[rgb(248,113,113)]",
                  )}>
                    当日 {props.equityDelta.dayChangePct >= 0 ? "+" : ""}{props.equityDelta.dayChangePct.toFixed(2)}%
                  </span>
                ) : null}
                {props.equityDelta?.weekChangePct != null ? (
                  <span className={cn(
                    "rounded-full border px-2.5 py-1 font-[var(--font-mono)]",
                    props.equityDelta.weekChangePct >= 0
                      ? "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]"
                      : "border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.12)] text-[rgb(248,113,113)]",
                  )}>
                    近 7 天 {props.equityDelta.weekChangePct >= 0 ? "+" : ""}{props.equityDelta.weekChangePct.toFixed(2)}%
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4">
              <LazyPerformanceChart
                snapshots={props.snapshots}
                cashFlowEvents={props.cashFlowEvents}
                mode="twr"
              />
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface)] p-5 sm:p-6">
          <div className={cn("inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", toneClass(primaryAction.tone))}>
            下一步
          </div>
          <div className="mt-4 flex items-start gap-3">
            <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border", toneClass(primaryAction.tone))}>
              <primaryAction.Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold tracking-[-0.01em] text-[var(--text)]">{primaryAction.label}</div>
              <div className="mt-1 text-sm leading-5 text-[var(--muted)]">{primaryAction.hint}</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <DaaSurfaceActionButton tone={primaryAction.tone === "amber" ? "warning" : primaryAction.tone === "green" ? "success" : "primary"} onClick={primaryAction.onClick} className="justify-center">
              <primaryAction.Icon className="h-3.5 w-3.5" />
              {primaryAction.label}
            </DaaSurfaceActionButton>
            <DaaSurfaceActionButton tone="slate" onClick={props.onRefresh} disabled={props.refreshing} className="justify-center">
              <RefreshCcw className={cn("h-3.5 w-3.5", props.refreshing ? "animate-spin" : "")} />
              {props.refreshing ? "刷新中" : "刷新"}
            </DaaSurfaceActionButton>
            <PortfolioCashEntryPopover
              side="deposit"
              baseCurrency={props.baseCurrency}
              onSuccess={props.onCashRefresh}
              open={depositOpen}
              onOpenChange={setDepositOpen}
            />
            <PortfolioCashEntryPopover
              side="withdraw"
              baseCurrency={props.baseCurrency}
              onSuccess={props.onCashRefresh}
              open={withdrawOpen}
              onOpenChange={setWithdrawOpen}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-px border-t border-[var(--border)] bg-[var(--border)] lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.46fr)]">
        <div className="bg-[var(--surface)] p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <PieChart className="h-4 w-4 text-[var(--primary)]" />
                配置分布
              </div>
              <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
                展示全部持仓与目标篮子，当前权重优先；无持仓时显示目标权重。
              </div>
            </div>
            <DaaSurfaceStatusPill tone="slate">{allocationRows.length} 项</DaaSurfaceStatusPill>
          </div>
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {allocationRows.length > 0 ? allocationRows.map((row) => {
              const pct = row.actualWeightPct || row.targetWeightPct;
              const widthPct = Math.max(6, Math.min(100, (pct / maxAllocationPct) * 100));
              const gap = row.gapPct;
              return (
                <div
                  key={row.assetKey}
                  className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--text)]">{row.symbol}</div>
                    <div className="truncate text-[11px] text-[var(--muted)]">{row.assetClass || row.market}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--elevated)]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--success))]"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--muted)]">
                      <span>当前 {formatPercent(row.actualWeightPct)}</span>
                      <span>目标 {formatPercent(row.targetWeightPct)}</span>
                      {gap != null ? (
                        <span className={Math.abs(gap) >= 5 ? "text-[var(--amber)]" : "text-[var(--success)]"}>
                          偏离 {gap >= 0 ? "+" : ""}{formatPercent(gap)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-[58px] text-right font-[var(--font-mono)] text-sm text-[var(--text)]">
                    {formatPercent(pct)}
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-[12px] border border-dashed border-[var(--border-strong)] px-4 py-5 text-sm text-[var(--muted)] xl:col-span-2">
                暂无配置资产，记录入金后可在下方资产列表维护配置。
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--surface)] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Gauge className="h-4 w-4 text-[var(--amber)]" />
              调仓状态
            </div>
            <DaaSurfaceStatusPill tone={cycleStatusTone(props.latestCycle)}>{latestCycleStatus}</DaaSurfaceStatusPill>
          </div>
          <div className="mt-5 space-y-3">
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">最大偏离</div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text)]">{maxDriftRow?.symbol ?? "暂无偏离"}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {maxDriftRow ? `目标 ${formatPercent(maxDriftRow.targetWeightPct)} · 当前 ${formatPercent(maxDriftRow.actualWeightPct)}` : "目标权重设置后会自动计算"}
                  </div>
                </div>
                <div className={cn(
                  "font-[var(--font-mono)] text-lg",
                  Math.abs(maxDriftRow?.gapPct ?? 0) >= 5 ? "text-[var(--amber)]" : "text-[var(--success)]",
                )}>
                  {maxDriftRow ? formatPercent(maxDriftRow.gapPct ?? 0) : "--"}
                </div>
              </div>
              <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                {maxDriftReason}
              </div>
            </div>
            <button
              type="button"
              onClick={props.onOpenRebalance}
              className="group flex w-full items-center justify-between rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--elevated)]"
            >
              <div className="flex items-center gap-3">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-[10px] border", toneClass(primaryAction.tone))}>
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">进入调仓工作流</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {props.latestCycle?.proposals.length ? `${props.latestCycle.proposals.length} 条建议可审阅` : "生成、审阅并执行调仓建议"}
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-[var(--faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--muted)]" />
            </button>
          </div>
        </div>

        <div className="bg-[var(--surface)] p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            {priceIssueCount > 0 ? (
              <AlertTriangle className="h-4 w-4 text-[var(--amber)]" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
            )}
            数据健康
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">价格状态</span>
              <DaaSurfaceStatusPill tone={priceIssueCount > 0 ? "amber" : "green"}>
                {priceIssueCount > 0 ? `${priceIssueCount} 项待更新` : "正常"}
              </DaaSurfaceStatusPill>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">观察资产</span>
              <span className="font-[var(--font-mono)] text-[var(--text)]">{props.watchlistCount}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">目标篮子</span>
              <span className="font-[var(--font-mono)] text-[var(--text)]">{basketCount}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
