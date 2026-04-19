"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, RefreshCcw } from "lucide-react";
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { DashboardEmptyState } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { PerformanceChart } from "@/app/daa/dashboard/_shared/PerformanceChart";
import { cn } from "@/lib/utils";

const PIE_COLORS = ["#38BDF8", "#818CF8", "#34D399", "#F6AD55", "#F87171", "#A78BFA"];

export type PortfolioStatusProps = {
  baseCurrency: string;
  totalEquity: number;
  holdingsValue: number;
  availableCashValue: number;
  frozenCashValue: number;
  equityDelta: { dayChange: number | null; dayChangePct: number | null; weekChange: number | null; weekChangePct: number | null } | null;
  snapshots: Array<{ ts: string; totalEquity: number }>;
  cashFlowEvents?: Array<{ ts: string; side: "deposit" | "withdraw"; amount: number }>;
  allocationSummary: {
    topHoldings: Array<{ assetKey: string; symbol: string; value: number; weightPct: number }>;
    cashValue?: number;
  } | null;
  loading: boolean;
  refreshing: boolean;
  priceStreamConnected?: boolean;
  onRefresh: () => void;
  /** 入金/出金回调（不传则不显示按钮） */
  onDeposit?: () => void;
  onWithdraw?: () => void;
};

export function PortfolioStatus(props: PortfolioStatusProps) {
  const allocationData = useMemo(() => {
    const items = (props.allocationSummary?.topHoldings || []).map((item) => ({ name: item.symbol, value: item.value }));
    const cashValue = props.allocationSummary?.cashValue || 0;
    if (cashValue > 0) items.push({ name: "现金", value: cashValue });
    return items;
  }, [props.allocationSummary]);

  const isEmpty = !props.totalEquity;
  const syncTone = props.loading ? "slate" : props.refreshing ? "amber" : isEmpty ? "slate" : "green";
  const syncLabel = props.loading ? "准备中" : props.refreshing ? "同步中" : isEmpty ? "等待入金" : "数据已同步";

  if (props.loading && !props.totalEquity) {
    return <DaaSurfaceEmptyState title="正在准备数据…" description="正在同步账户、观察列表与再平衡周期，请稍候。" />;
  }

  return (
    <div className="space-y-4">
      {/* ─── 摘要行：总权益 + 涨跌 + 现金 + 状态 ─── */}
      <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-[var(--font-mono)] text-2xl tabular-nums text-[var(--text)]">
              {formatCurrency(props.totalEquity, props.baseCurrency)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              {props.equityDelta?.dayChangePct != null && (
                <span className={(props.equityDelta.dayChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {(props.equityDelta.dayChange ?? 0) >= 0 ? <ArrowUp className="mr-0.5 inline h-3 w-3" /> : <ArrowDown className="mr-0.5 inline h-3 w-3" />}
                  今日 {formatPercent(Math.abs(props.equityDelta.dayChangePct))}
                </span>
              )}
              {props.equityDelta?.weekChangePct != null && (
                <span className={(props.equityDelta.weekChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {(props.equityDelta.weekChange ?? 0) >= 0 ? <ArrowUp className="mr-0.5 inline h-3 w-3" /> : <ArrowDown className="mr-0.5 inline h-3 w-3" />}
                  本周 {formatPercent(Math.abs(props.equityDelta.weekChangePct))}
                </span>
              )}
              <span className="text-[var(--muted)]">
                持仓 {formatCurrency(props.holdingsValue, props.baseCurrency)} · 现金 {formatCurrency(props.availableCashValue, props.baseCurrency)}
                {props.frozenCashValue > 0 && ` · 冻结 ${formatCurrency(props.frozenCashValue, props.baseCurrency)}`}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.onDeposit ? (
              <DaaSurfaceActionButton tone="success" onClick={props.onDeposit}>
                <Plus className="h-3.5 w-3.5" />
                入金
              </DaaSurfaceActionButton>
            ) : null}
            {props.onWithdraw ? (
              <DaaSurfaceActionButton tone="warning" onClick={props.onWithdraw}>
                <Minus className="h-3.5 w-3.5" />
                出金
              </DaaSurfaceActionButton>
            ) : null}
            <DaaSurfaceStatusPill tone="slate">本地模拟</DaaSurfaceStatusPill>
            <DaaSurfaceStatusPill tone={syncTone}>{syncLabel}</DaaSurfaceStatusPill>
            {props.priceStreamConnected != null && (
              <DaaSurfaceStatusPill tone={props.priceStreamConnected ? "green" : "slate"}>
                {props.priceStreamConnected ? "实时" : "离线"}
              </DaaSurfaceStatusPill>
            )}
            <DaaSurfaceActionButton onClick={props.onRefresh} disabled={props.loading || props.refreshing}>
              <RefreshCcw className={cn("h-3.5 w-3.5", props.refreshing ? "animate-spin" : "")} />
              {props.refreshing ? "刷新中…" : "刷新"}
            </DaaSurfaceActionButton>
          </div>
        </div>
      </div>

      {/* ─── 图表区：权益走势 + 资产分布（直接显示，不折叠） ─── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionErrorBoundary sectionName="权益走势">
          <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] p-4">
            {!props.snapshots || props.snapshots.length === 0 ? (
              <SkeletonChart />
            ) : (
              <PerformanceChart snapshots={props.snapshots} cashFlowEvents={props.cashFlowEvents} />
            )}
          </div>
        </SectionErrorBoundary>

        <SectionErrorBoundary sectionName="资产分布">
          <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] p-4">
            {allocationData.length > 0 && props.totalEquity > 0 ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={78} paddingAngle={3}>
                        {allocationData.map((item, index) => <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 14, color: "#e2e8f0" }}
                        itemStyle={{ color: "#e2e8f0" }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={((value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`) as any}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--faint)]">Top Holdings</div>
                  <div className="mt-3 space-y-3">
                    {(props.allocationSummary?.topHoldings || []).slice(0, 5).map((item) => (
                      <div key={item.assetKey} className="flex items-center justify-between gap-3 text-sm">
                        <div className="font-medium text-[var(--text)]">{item.symbol}</div>
                        <div className="text-right">
                          <div className="text-[var(--text)]">{formatCurrency(item.value, props.baseCurrency)}</div>
                          <div className="text-xs text-[var(--muted)]">{item.weightPct.toFixed(2)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <DashboardEmptyState title="暂无持仓" description="入金并添加标的后，持仓信息将在此显示。" className="border-0 bg-transparent px-0 py-8" />
            )}
          </div>
        </SectionErrorBoundary>
      </div>

      {/* 现金摘要已在摘要行展示；完整流水请到交易记录页查看 */}
    </div>
  );
}
