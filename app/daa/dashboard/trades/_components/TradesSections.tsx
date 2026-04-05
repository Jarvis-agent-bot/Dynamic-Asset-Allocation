"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Filter, RefreshCcw } from "lucide-react";

import { formatCurrency, formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import type { TradesModel, TradeTab, TradeFilters } from "@/app/daa/dashboard/_hooks/useTradesModel";
import { cn } from "@/lib/utils";
import {
  DaaSurfaceActionButton,
  DaaSurfaceFilterChip,
  DaaSurfaceEmptyState,
  DaaSurfacePageHeader,
  DaaSurfaceStatusPill,
  daaSurfaceDenseFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";

/* ------------------------------------------------------------------ */
/*  Label helpers                                                      */
/* ------------------------------------------------------------------ */

const STATUS_TONE: Record<string, "cyan" | "amber" | "green" | "indigo" | "slate"> = {
  generated: "indigo", reviewing: "amber", executing: "cyan", completed: "green", cancelled: "slate",
};

function cycleStatusLabel(s: string): string {
  return { generated: "已生成", reviewing: "审阅中", executing: "执行中", completed: "已完成", cancelled: "已取消" }[s] || s;
}

function orderStatusLabel(s: string): string {
  return { ready: "待执行", submitted: "已提交", partially_filled: "部分成交", executed: "已执行", rejected: "已拒绝", canceled: "已取消" }[s] || s;
}

function orderStatusTone(s: string): "cyan" | "amber" | "green" | "indigo" | "slate" {
  return { ready: "cyan" as const, submitted: "indigo" as const, partially_filled: "amber" as const, executed: "green" as const, rejected: "amber" as const, canceled: "slate" as const }[s] || "slate";
}

function triggerSourceLabel(s: string): string {
  return { calendar: "定期", drift: "偏移", risk: "风险", cash_idle: "现金闲置" }[s] || "手动";
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */

export function TradesHeader({ model }: { model: TradesModel }) {
  return (
    <DaaSurfacePageHeader
      title="交易记录"
      description="调仓周期、订单明细和执行回顾"
      actions={
        <DaaSurfaceActionButton onClick={() => void model.load(true)} disabled={model.loading || model.refreshing}>
          <RefreshCcw className={cn("h-4 w-4", model.refreshing && "animate-spin")} />
          {model.refreshing ? "刷新中…" : "刷新"}
        </DaaSurfaceActionButton>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Compact overview: metrics + filter in one row                      */
/* ------------------------------------------------------------------ */

export function TradesCompactOverview({ model }: { model: TradesModel }) {
  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilter = Boolean(model.filters.startDate || model.filters.endDate || model.filters.symbol || model.filters.side || model.filters.status);

  function updateFilter(patch: Partial<TradeFilters>) {
    model.setFilters((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="space-y-3">
      {/* 概览指标行 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-3">
        <Metric label="再平衡" value={`${model.cycles.length}`} sub={`完成 ${model.completedCycleCount}`} />
        <Separator />
        <Metric label="订单" value={`${model.orders.length}`} sub={`成交 ${model.executedOrderCount}`} />
        <Separator />
        <Metric label="成交额" value={formatCurrency(model.executedOrderNotional, model.baseCurrency)} />
        <Separator />
        <Metric label="已实现 P&L" value={formatCurrency(model.realizedPnl, model.baseCurrency)} tone={model.realizedPnl >= 0 ? "green" : "red"} />

        <div className="ml-auto flex items-center gap-2">
          {model.latestActivityAt ? (
            <span className="text-[11px] text-[var(--faint)]">最近 {formatDateTime(model.latestActivityAt)}</span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs transition-colors",
              showFilters || hasActiveFilter ? "bg-[rgba(56,189,248,0.12)] text-[var(--primary)]" : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            筛选{hasActiveFilter ? " ●" : ""}
          </button>
        </div>
      </div>

      {/* 可折叠筛选区 */}
      {showFilters ? (
        <div className="flex flex-wrap items-end gap-3 rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.3)] px-4 py-3">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">开始</span>
            <input type="date" value={model.filters.startDate ?? ""} onChange={(e) => updateFilter({ startDate: e.target.value || undefined })} className={cn(daaSurfaceDenseFieldClassName, "w-[130px]")} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">结束</span>
            <input type="date" value={model.filters.endDate ?? ""} onChange={(e) => updateFilter({ endDate: e.target.value || undefined })} className={cn(daaSurfaceDenseFieldClassName, "w-[130px]")} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">标的</span>
            <input type="text" placeholder="AAPL" value={model.filters.symbol ?? ""} onChange={(e) => updateFilter({ symbol: e.target.value || undefined })} className={cn(daaSurfaceDenseFieldClassName, "w-[100px]")} />
          </label>
          <div className="flex items-center gap-1.5 pb-0.5">
            <DaaSurfaceFilterChip active={model.filters.side === "BUY"} onClick={() => updateFilter({ side: model.filters.side === "BUY" ? undefined : "BUY" })}>买入</DaaSurfaceFilterChip>
            <DaaSurfaceFilterChip active={model.filters.side === "SELL"} onClick={() => updateFilter({ side: model.filters.side === "SELL" ? undefined : "SELL" })}>卖出</DaaSurfaceFilterChip>
          </div>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">状态</span>
            <select value={model.filters.status ?? ""} onChange={(e) => updateFilter({ status: e.target.value || undefined })} className={cn(dasSurfaceDenseFieldClassName, "w-[100px]")}>
              <option value="">全部</option>
              <option value="ready">待执行</option>
              <option value="submitted">已提交</option>
              <option value="executed">已执行</option>
              <option value="rejected">已拒绝</option>
              <option value="canceled">已取消</option>
            </select>
          </label>
          {hasActiveFilter ? (
            <DaaSurfaceActionButton tone="slate" className="mb-0.5 text-xs" onClick={() => model.setFilters({})}>清除</DaaSurfaceActionButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric(props: { label: string; value: string; sub?: string; tone?: "green" | "red" }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">{props.label}</div>
      <div className={cn("font-[var(--font-mono)] text-sm font-semibold", props.tone === "green" ? "text-emerald-400" : props.tone === "red" ? "text-red-400" : "text-[var(--text)]")}>
        {props.value}
      </div>
      {props.sub ? <div className="text-[10px] text-[var(--faint)]">{props.sub}</div> : null}
    </div>
  );
}

function Separator() {
  return <div className="hidden h-8 w-px bg-[var(--border)] md:block" />;
}

/* ------------------------------------------------------------------ */
/*  Error state                                                        */
/* ------------------------------------------------------------------ */

export function TradesErrorState({ error }: { error: string }) {
  return <DashboardErrorNotice title="交易记录加载失败" description={error} />;
}

/* ------------------------------------------------------------------ */
/*  Tabs panel                                                         */
/* ------------------------------------------------------------------ */

const TAB_META: Record<TradeTab, string> = {
  cycles: "再平衡周期",
  orders: "订单明细",
  reports: "复盘报告",
};

export function TradesTabsPanel({ model }: { model: TradesModel }) {
  return (
    <div className="space-y-3">
      {/* Tab 切换 */}
      <div className="inline-flex rounded-[12px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-1" role="tablist">
        {(Object.keys(TAB_META) as TradeTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={tab === model.activeTab}
            onClick={() => model.setActiveTab(tab)}
            className={cn(
              "rounded-[10px] px-3 py-2 text-sm transition-colors",
              tab === model.activeTab ? "bg-[rgba(56,189,248,0.12)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]",
            )}
          >
            {TAB_META[tab]}
          </button>
        ))}
      </div>

      {model.activeTab === "cycles" ? <CyclesPanel model={model} /> : null}
      {model.activeTab === "orders" ? <OrdersPanel model={model} /> : null}
      {model.activeTab === "reports" ? <ReportsPanel model={model} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cycles                                                             */
/* ------------------------------------------------------------------ */

function CyclesPanel({ model }: { model: TradesModel }) {
  if (model.cycles.length <= 0) {
    return (
      <DaaSurfaceEmptyState
        title="暂无再平衡周期"
        description="前往调仓页生成首个再平衡建议。"
        className="py-14"
        action={<Link href="/daa/dashboard/rebalance" className="text-sm text-[var(--primary)] hover:underline">前往调仓 →</Link>}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
      <table className="w-full border-collapse bg-[rgba(8,12,20,0.32)]">
        <thead>
          <tr>
            <TH>周期</TH><TH>状态</TH><TH>触发</TH><TH align="right">订单</TH><TH align="right">金额</TH><TH align="right">时间</TH>
          </tr>
        </thead>
        <tbody>
          {model.cycles.map((c) => {
            const count = c.executionSummary ? (c.executionSummary.ordersExecuted ?? 0) + (c.executionSummary.ordersSubmitted ?? 0) + (c.executionSummary.ordersFailed ?? 0) : c.executedOrders.length;
            return (
              <tr key={c.cycleId} className="transition-colors hover:bg-[rgba(255,255,255,0.02)]">
                <TD mono><Link href={`/daa/dashboard/rebalance?cycleId=${c.cycleId}`} className="text-[var(--primary)] hover:underline">{c.cycleId.slice(0, 8)}</Link></TD>
                <TD><DaaSurfaceStatusPill tone={STATUS_TONE[c.status] ?? "slate"}>{cycleStatusLabel(c.status)}</DaaSurfaceStatusPill></TD>
                <TD>{triggerSourceLabel(c.triggerSource)}</TD>
                <TD mono align="right">{count}</TD>
                <TD mono align="right">{formatCurrency(c.executionSummary?.totalNotional ?? 0, model.baseCurrency)}</TD>
                <TD align="right">{formatDateTime(c.createdAt)}</TD>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Orders                                                             */
/* ------------------------------------------------------------------ */

function OrdersPanel({ model }: { model: TradesModel }) {
  const [visibleCount, setVisibleCount] = useState(50);

  if (model.orders.length <= 0) {
    return (
      <DaaSurfaceEmptyState
        title="暂无订单记录"
        description="完成一次调仓执行后订单会自动出现。"
        className="py-14"
        action={<Link href="/daa/dashboard/rebalance" className="text-sm text-[var(--primary)] hover:underline">前往调仓 →</Link>}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
      <table className="w-full border-collapse bg-[rgba(8,12,20,0.32)]">
        <thead>
          <tr>
            <TH>标的</TH><TH>方向</TH><TH>状态</TH><TH align="right">数量</TH><TH align="right">价格</TH><TH align="right">时间</TH>
          </tr>
        </thead>
        <tbody>
          {model.orders.slice(0, visibleCount).map((o) => (
            <tr key={o.ticketId} className="transition-colors hover:bg-[rgba(255,255,255,0.02)]">
              <TD mono>{o.symbol}</TD>
              <TD>
                <span className={o.side === "BUY" ? "text-emerald-400" : "text-red-400"}>
                  {o.side === "BUY" ? "买入" : "卖出"}
                </span>
              </TD>
              <TD><DaaSurfaceStatusPill tone={orderStatusTone(o.status)}>{orderStatusLabel(o.status)}</DaaSurfaceStatusPill></TD>
              <TD mono align="right">{o.qty.toFixed(4)}</TD>
              <TD mono align="right">{formatCurrency(o.avgFillPrice || o.price, o.instrumentCurrency || "USD")}</TD>
              <TD align="right">{formatDateTime(o.updatedAt)}</TD>
            </tr>
          ))}
        </tbody>
      </table>
      {model.orders.length > visibleCount ? (
        <div className="border-t border-[var(--border)] px-4 py-2 text-center">
          <button type="button" className="text-xs text-[var(--primary)] hover:underline" onClick={() => setVisibleCount((p) => p + 50)}>
            加载更多（剩余 {model.orders.length - visibleCount}）
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */

function ReportsPanel({ model }: { model: TradesModel }) {
  if (model.sortedReports.length <= 0) {
    return (
      <DaaSurfaceEmptyState
        title="暂无复盘报告"
        description="完成一次实际执行后会自动生成复盘报告。"
        className="py-14"
        action={<Link href="/daa/dashboard/rebalance" className="text-sm text-[var(--primary)] hover:underline">前往调仓 →</Link>}
      />
    );
  }

  return (
    <div className="space-y-2">
      {model.sortedReports.map((r) => {
        const expanded = model.expandedReportCycleId === r.cycleId;
        const orderCount = (r.executionSummary?.ordersExecuted ?? 0) + (r.executionSummary?.ordersSubmitted ?? 0) + (r.executionSummary?.ordersFailed ?? 0);
        return (
          <div key={r.cycleId} className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.34)]">
            <button
              type="button"
              onClick={() => model.setExpandedReportCycleId(expanded ? null : r.cycleId)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="font-[var(--font-mono)] text-sm text-[var(--text)]">{r.cycleId.slice(0, 8)}</span>
                <DaaSurfaceStatusPill tone={STATUS_TONE[r.status] ?? "slate"}>{cycleStatusLabel(r.status)}</DaaSurfaceStatusPill>
                <span className="text-xs text-[var(--faint)]">{triggerSourceLabel(r.triggerSource)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-[var(--faint)] sm:inline">{formatDateTime(r.reportCreatedAt)}</span>
                {expanded ? <ChevronUp className="h-4 w-4 text-[var(--faint)]" /> : <ChevronDown className="h-4 w-4 text-[var(--faint)]" />}
              </div>
            </button>

            {expanded ? (
              <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
                {/* 三列指标 */}
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricBlock title="执行概览" items={[
                    `订单 ${orderCount}`,
                    `金额 ${formatCurrency(r.executionSummary?.totalNotional ?? 0, model.baseCurrency)}`,
                    `费用 ${formatCurrency(r.pnlAttribution.feeTotal, model.baseCurrency)}`,
                  ]} />
                  <MetricBlock title="收益归因" items={[
                    `已实现 ${formatCurrency(r.pnlAttribution.realizedPnl, model.baseCurrency)}`,
                    `未实现 ${formatCurrency(r.pnlAttribution.unrealizedPnl, model.baseCurrency)}`,
                    `汇率 ${formatCurrency(r.pnlAttribution.fxImpact, model.baseCurrency)}`,
                  ]} />
                  <MetricBlock title="风控变化" items={[
                    `回撤 ${r.riskDelta.maxDrawdownBefore.toFixed(1)}% → ${r.riskDelta.maxDrawdownAfter.toFixed(1)}%`,
                    `集中度 ${r.riskDelta.hhiBefore.toFixed(1)}% → ${r.riskDelta.hhiAfter.toFixed(1)}%`,
                    `漂移 ${r.riskDelta.maxDriftBefore.toFixed(1)}% → ${r.riskDelta.maxDriftAfter.toFixed(1)}%`,
                  ]} />
                </div>
                {/* 权益变化 + 贡献 */}
                <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)]">
                  <span>权益 {formatCurrency(r.beforeSnapshot.totalEquity, model.baseCurrency)} → {formatCurrency(r.afterSnapshot.totalEquity, model.baseCurrency)}</span>
                  <span>贡献前三: {r.pnlAttribution.topContributors.slice(0, 3).map((c) => `${c.symbol} ${formatCurrency(c.pnl, model.baseCurrency)}`).join("、") || "—"}</span>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MetricBlock(props: { title: string; items: string[] }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[rgba(24,34,54,0.6)] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">{props.title}</div>
      <div className="mt-2 space-y-1 text-xs text-[var(--muted)]">
        {props.items.map((item, i) => <div key={i}>{item}</div>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Table primitives                                                   */
/* ------------------------------------------------------------------ */

function TH({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className="border-b border-[var(--border)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]" style={{ textAlign: align }}>{children}</th>;
}

function TD({ children, align = "left", mono }: { children: React.ReactNode; align?: "left" | "right"; mono?: boolean }) {
  return (
    <td className={cn("border-b border-[var(--border)] px-4 py-2.5 text-sm", mono ? "font-[var(--font-mono)] text-[var(--text)]" : "text-[var(--muted)]")} style={{ textAlign: align }}>
      {children}
    </td>
  );
}

// Fix: import name typo guard
const dasSurfaceDenseFieldClassName = daaSurfaceDenseFieldClassName;
