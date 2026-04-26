"use client";

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
  Route,
  WalletCards,
} from "lucide-react";
import type { ComponentType } from "react";

import type { DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { DaaSurfaceActionButton, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";
import type { AssetUniverseView, RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";

type HomeAction = {
  label: string;
  hint: string;
  Icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  tone: "cyan" | "green" | "amber" | "indigo";
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
  holdingCount: number;
  watchlistCount: number;
  basketCount: number;
  latestCycle: RebalanceCycle | null | undefined;
  maxDriftPct: number;
  onDeposit: () => void;
  onNavigateTab: (tab: DashboardTab) => void;
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
  if (input.holdingCount <= 0 && input.watchlistCount <= 0) {
    return {
      label: "建立观察列表",
      hint: "先把候选资产放进视野",
      Icon: Eye,
      onClick: () => input.onNavigateTab("watchlist"),
      tone: "cyan",
    };
  }
  if (input.basketCount <= 0) {
    return {
      label: "设置目标权重",
      hint: "把观察资产转成配置意图",
      Icon: Route,
      onClick: () => input.onNavigateTab("watchlist"),
      tone: "indigo",
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
  if (tone === "indigo") return "border-[var(--indigo-border)] bg-[var(--indigo-bg)] text-[var(--indigo)]";
  return "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]";
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
  latestCycle?: RebalanceCycle | null;
  refreshing: boolean;
  priceStreamConnected?: boolean;
  onRefresh: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onNavigateTab: (tab: DashboardTab) => void;
  onOpenRebalance: () => void;
}) {
  const basketCount = props.rows.filter((row) => row.watchEnabled && row.targetWeightHint > 0).length;
  const investedRatio = props.totalEquity > 0 ? (props.holdingsValue / props.totalEquity) * 100 : 0;
  const cashRatio = props.totalEquity > 0 ? (props.availableCashValue / props.totalEquity) * 100 : 0;
  const latestCycleStatus = cycleStatusLabel(props.latestCycle);
  const allocationRows = props.rows
    .filter((row) => row.holdingQty > 0 || row.actualWeightPct > 0 || row.targetWeightHint > 0)
    .sort((a, b) => (b.actualWeightPct || b.targetWeightPct) - (a.actualWeightPct || a.targetWeightPct))
    .slice(0, 5);
  const maxAllocationPct = Math.max(1, ...allocationRows.map((row) => row.actualWeightPct || row.targetWeightPct));
  const maxDriftRow = props.rows
    .filter((row) => row.gapPct != null)
    .sort((a, b) => Math.abs(b.gapPct ?? 0) - Math.abs(a.gapPct ?? 0))[0];
  const maxDriftPct = Math.abs(maxDriftRow?.gapPct ?? 0);
  const priceIssueCount = props.rows.filter((row) => row.priceStatus === "missing" || row.priceStatus === "stale").length;
  const primaryAction = resolvePrimaryAction({
    totalEquity: props.totalEquity,
    holdingCount: props.holdingCount,
    watchlistCount: props.watchlistCount,
    basketCount,
    latestCycle: props.latestCycle,
    maxDriftPct,
    onDeposit: props.onDeposit,
    onNavigateTab: props.onNavigateTab,
    onOpenRebalance: props.onOpenRebalance,
    onRefresh: props.onRefresh,
  });

  const tabActions = [
    { key: "positions" as const, label: "持仓", value: props.holdingCount, Icon: Briefcase },
    { key: "watchlist" as const, label: "观察", value: props.watchlistCount, Icon: Eye },
    { key: "analysis" as const, label: "风险", value: basketCount, Icon: LineChart },
  ];

  return (
    <section className="relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(13,19,32,0.98),rgba(9,14,24,0.94)_58%,rgba(18,26,42,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(56,189,248,0.8),rgba(246,173,85,0.55),transparent)]" />
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="border-b border-[var(--border)] p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                资产中枢
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
            {tabActions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => props.onNavigateTab(item.key)}
                className="group flex min-h-[86px] items-center justify-between rounded-[14px] border border-[var(--border)] bg-[rgba(255,255,255,0.025)] px-4 py-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[rgba(255,255,255,0.045)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    <item.Icon className="h-4 w-4 text-[var(--primary)]" />
                    {item.label}
                  </div>
                  <div className="mt-2 font-[var(--font-mono)] text-2xl text-[var(--text)]">{item.value}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--muted)]" />
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-6">
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
            <DaaSurfaceActionButton tone="success" onClick={props.onDeposit} className="justify-center">
              入金
            </DaaSurfaceActionButton>
            <DaaSurfaceActionButton tone="warning" onClick={props.onWithdraw} className="justify-center">
              出金
            </DaaSurfaceActionButton>
          </div>
        </div>
      </div>

      <div className="grid gap-px border-t border-[var(--border)] bg-[var(--border)] lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)_minmax(300px,0.58fr)]">
        <div className="bg-[rgba(8,12,20,0.82)] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <PieChart className="h-4 w-4 text-[var(--primary)]" />
              配置分布
            </div>
            <button
              type="button"
              onClick={() => props.onNavigateTab("analysis")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] transition-colors hover:text-[var(--primary-strong)]"
            >
              查看风险
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {allocationRows.length > 0 ? allocationRows.map((row) => {
              const pct = row.actualWeightPct || row.targetWeightPct;
              const widthPct = Math.max(6, Math.min(100, (pct / maxAllocationPct) * 100));
              return (
                <div key={row.assetKey} className="grid grid-cols-[88px_minmax(0,1fr)_62px] items-center gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--text)]">{row.symbol}</div>
                    <div className="truncate text-[11px] text-[var(--faint)]">{row.assetClass || row.market}</div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.05)]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--success))]"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <div className="text-right font-[var(--font-mono)] text-xs text-[var(--muted)]">
                    {formatPercent(pct)}
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-[12px] border border-dashed border-[var(--border-strong)] px-4 py-5 text-sm text-[var(--muted)]">
                暂无配置资产，先记录入金或加入观察列表。
              </div>
            )}
          </div>
        </div>

        <div className="bg-[rgba(8,12,20,0.82)] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Gauge className="h-4 w-4 text-[var(--amber)]" />
              调仓状态
            </div>
            <DaaSurfaceStatusPill tone={cycleStatusTone(props.latestCycle)}>{latestCycleStatus}</DaaSurfaceStatusPill>
          </div>
          <div className="mt-5 space-y-3">
            <div className="rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
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
            </div>
            <button
              type="button"
              onClick={props.onOpenRebalance}
              className="group flex w-full items-center justify-between rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[rgba(255,255,255,0.04)]"
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

        <div className="bg-[rgba(8,12,20,0.82)] p-5 sm:p-6">
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
            <div className="pt-1">
              <DaaSurfaceActionButton tone="slate" onClick={() => props.onNavigateTab("watchlist")} className="w-full justify-center">
                管理观察列表
              </DaaSurfaceActionButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
