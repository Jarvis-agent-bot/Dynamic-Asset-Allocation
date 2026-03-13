"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, RefreshCcw } from "lucide-react";

import { formatCurrency, formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardEmptyState, DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import type { TradesModel, TradeTab } from "@/app/daa/dashboard/_hooks/useTradesModel";
import { DeepLedgerActionButton, DeepLedgerMetricCard, DeepLedgerPageHeader, DeepLedgerPanel, DeepLedgerStatusPill } from "@/app/daa/dashboard/_components/DeepLedgerUI";

const TAB_META: Record<TradeTab, { label: string; subtitle: string }> = {
  cycles: { label: "再平衡周期", subtitle: "用时间线回顾每一次触发、状态与执行规模。" },
  orders: { label: "订单明细", subtitle: "查看买卖方向、数量、价格、所属周期与更新时间。" },
  reports: { label: "复盘报告", subtitle: "聚焦执行效果、收益归因与风险变化。" },
};

const STATUS_TONE: Record<string, "cyan" | "amber" | "green" | "indigo" | "slate"> = {
  generated: "indigo",
  reviewing: "amber",
  executing: "cyan",
  completed: "green",
  cancelled: "slate",
};

const emptyActionLinkClassName = "inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition-all hover:border-[var(--primary)]/30 hover:text-[var(--text)]";

function cycleStatusLabel(status: string): string {
  if (status === "generated") return "已生成";
  if (status === "reviewing") return "审阅中";
  if (status === "executing") return "执行中";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return status;
}

function orderStatusLabel(status: string): string {
  if (status === "ready") return "待执行";
  if (status === "executed") return "已执行";
  if (status === "rejected") return "已拒绝";
  if (status === "canceled") return "已取消";
  return status;
}

function orderStatusTone(status: string): "cyan" | "amber" | "green" | "indigo" | "slate" {
  if (status === "ready") return "cyan";
  if (status === "executed") return "green";
  if (status === "rejected") return "amber";
  if (status === "canceled") return "slate";
  return "slate";
}

function orderSideLabel(side: string): string {
  if (side === "buy") return "买入";
  if (side === "sell") return "卖出";
  return side;
}

function triggerSourceLabel(triggerSource: string): string {
  if (triggerSource === "calendar") return "定期触发";
  if (triggerSource === "drift") return "偏移触发";
  if (triggerSource === "risk") return "风险触发";
  if (triggerSource === "cash_idle") return "现金闲置触发";
  return "手动触发";
}

function TableHeadCell({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className="border-b border-[var(--border)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]" style={{ textAlign: align }}>
      {children}
    </th>
  );
}

function TableCellMono({ children, align = "left", className = "" }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={`border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--text)] ${className}`} style={{ textAlign: align, fontFamily: "var(--font-mono)" }}>
      {children}
    </td>
  );
}

function TableCellText({ children, align = "left", className = "" }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={`border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)] ${className}`} style={{ textAlign: align }}>
      {children}
    </td>
  );
}

export function TradesHeader({ model }: { model: TradesModel }) {
  return (
    <DeepLedgerPageHeader
      eyebrow="交易审计"
      title="交易记录"
      description="集中查看再平衡周期、订单与复盘结果，便于回顾执行质量和风险变化。"
      actions={(
        <DeepLedgerActionButton onClick={() => void model.load(true)} disabled={model.loading || model.refreshing}>
          <RefreshCcw className={`h-4 w-4 ${model.refreshing ? "animate-spin" : ""}`} />
          {model.refreshing ? "刷新中…" : "刷新数据"}
        </DeepLedgerActionButton>
      )}
    />
  );
}

export function TradesSummaryMetrics({ model }: { model: TradesModel }) {
  const activityLabel = model.latestActivityAt ? `最近活动 ${formatDateTime(model.latestActivityAt)}` : "等待首个执行周期";
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DeepLedgerMetricCard label="再平衡周期" value={`${model.cycles.length}`} subLabel={`已完成 ${model.completedCycleCount} 个`} accent="cyan" />
      <DeepLedgerMetricCard label="订单记录" value={`${model.orders.length}`} subLabel={`成交 ${model.executedOrderCount} 笔`} accent="green" />
      <DeepLedgerMetricCard label="执行金额" value={formatCurrency(model.totalNotional, "USD")} subLabel="累计周期名义金额" accent="amber" />
      <DeepLedgerMetricCard label="已实现收益" value={formatCurrency(model.realizedPnl, "USD")} subLabel={activityLabel} accent="indigo" />
    </div>
  );
}

export function TradesErrorState({ error }: { error: string }) {
  return <DashboardErrorNotice title="交易记录加载失败" description={error} />;
}

export function TradesTabsPanel({ model }: { model: TradesModel }) {
  const tabMeta = TAB_META[model.activeTab];
  return (
    <DeepLedgerPanel accent="slate" title="视图切换" subtitle="周期是一级视角，订单与复盘是二级明细。">
      <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[rgba(8,12,20,0.45)] p-2 sm:grid-cols-3">
        {(Object.keys(TAB_META) as TradeTab[]).map((tab) => {
          const active = tab === model.activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => model.setActiveTab(tab)}
              className={[
                "rounded-[16px] border px-4 py-3 text-left transition-all",
                active
                  ? "border-[var(--primary)]/35 bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                  : "border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              <div className="text-sm font-semibold">{TAB_META[tab].label}</div>
              <div className="mt-1 text-xs text-[var(--faint)]">{TAB_META[tab].subtitle}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-4 py-3 text-sm text-[var(--muted)]">
        {tabMeta.subtitle}
      </div>

      {model.activeTab === "cycles" ? <TradesCyclesPanel model={model} /> : null}
      {model.activeTab === "orders" ? <TradesOrdersPanel model={model} /> : null}
      {model.activeTab === "reports" ? <TradesReportsPanel model={model} /> : null}
    </DeepLedgerPanel>
  );
}

export function TradesCyclesPanel({ model }: { model: TradesModel }) {
  if (model.cycles.length <= 0) {
    return (
      <DashboardEmptyState
        title="还没有再平衡周期"
        description="先到工作台生成第一轮建议并确认执行，这里会自动沉淀完整的时间线与状态变化；如果当前只有目标写回、没有实际成交，这里仍会保持空白。"
        className="mt-4 px-5 py-14"
        action={<Link href="/daa/dashboard/workbench?tab=rebalance" className={emptyActionLinkClassName}>前往工作台生成建议</Link>}
      />
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[18px] border border-[var(--border)]">
      <table className="w-full border-collapse bg-[rgba(8,12,20,0.32)]">
        <thead>
          <tr>
            <TableHeadCell>周期</TableHeadCell>
            <TableHeadCell>状态</TableHeadCell>
            <TableHeadCell>触发源</TableHeadCell>
            <TableHeadCell align="right">订单数</TableHeadCell>
            <TableHeadCell align="right">执行金额</TableHeadCell>
            <TableHeadCell align="right">创建时间</TableHeadCell>
          </tr>
        </thead>
        <tbody>
          {model.cycles.map((cycle) => (
            <tr key={cycle.cycleId}>
              <TableCellMono>{cycle.cycleId.slice(0, 8)}</TableCellMono>
              <TableCellText><DeepLedgerStatusPill tone={STATUS_TONE[cycle.status] ?? "slate"}>{cycleStatusLabel(cycle.status)}</DeepLedgerStatusPill></TableCellText>
              <TableCellText>{triggerSourceLabel(cycle.triggerSource)}</TableCellText>
              <TableCellMono align="right">{cycle.executionSummary?.ordersExecuted ?? cycle.executedOrders.length}</TableCellMono>
              <TableCellMono align="right">{formatCurrency(cycle.executionSummary?.totalNotional ?? 0, "USD")}</TableCellMono>
              <TableCellText align="right">{formatDateTime(cycle.createdAt)}</TableCellText>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TradesOrdersPanel({ model }: { model: TradesModel }) {
  if (model.orders.length <= 0) {
    return (
      <DashboardEmptyState
        title="还没有订单记录"
        description="订单会在你确认执行建议后自动写入；如果这轮只是写回目标权重、还没有实际成交，这里不会生成订单记录。"
        className="mt-4 px-5 py-14"
        action={<Link href="/daa/dashboard/workbench?tab=rebalance" className={emptyActionLinkClassName}>去工作台完成一次执行</Link>}
      />
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-[18px] border border-[var(--border)]">
      <table className="w-full border-collapse bg-[rgba(8,12,20,0.32)]">
        <thead>
          <tr>
            <TableHeadCell>订单</TableHeadCell>
            <TableHeadCell>方向</TableHeadCell>
            <TableHeadCell>状态</TableHeadCell>
            <TableHeadCell align="right">数量</TableHeadCell>
            <TableHeadCell align="right">价格</TableHeadCell>
            <TableHeadCell align="right">更新时间</TableHeadCell>
          </tr>
        </thead>
        <tbody>
          {model.orders.map((order) => (
            <tr key={order.ticketId}>
              <TableCellMono>{order.symbol}</TableCellMono>
              <TableCellText>{orderSideLabel(order.side)}</TableCellText>
              <TableCellText><DeepLedgerStatusPill tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</DeepLedgerStatusPill></TableCellText>
              <TableCellMono align="right">{order.qty.toFixed(4)}</TableCellMono>
              <TableCellMono align="right">{formatCurrency(order.price, order.instrumentCurrency || "USD")}</TableCellMono>
              <TableCellText align="right">{formatDateTime(order.updatedAt)}</TableCellText>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TradesReportsPanel({ model }: { model: TradesModel }) {
  return (
    <div className="mt-4 space-y-3">
      {model.sortedReports.length > 0 ? model.sortedReports.map((report) => {
        const expanded = model.expandedReportCycleId === report.cycleId;
        return (
          <div key={report.cycleId} className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.34)] p-4">
            <button
              type="button"
              onClick={() => model.setExpandedReportCycleId(expanded ? null : report.cycleId)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <div className="font-[var(--font-mono)] text-sm text-[var(--text)]">{report.cycleId.slice(0, 8)}</div>
                <div className="mt-1 text-xs text-[var(--faint)]">{formatDateTime(report.reportCreatedAt)}</div>
              </div>
              <div className="flex items-center gap-2">
                <DeepLedgerStatusPill tone={STATUS_TONE[report.status] ?? "slate"}>{cycleStatusLabel(report.status)}</DeepLedgerStatusPill>
                {expanded ? <ChevronUp className="h-4 w-4 text-[var(--faint)]" /> : <ChevronDown className="h-4 w-4 text-[var(--faint)]" />}
              </div>
            </button>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(24,34,54,0.72)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">执行概览</div>
                <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                  <div>订单数 {report.executionSummary?.ordersExecuted ?? 0}</div>
                  <div>成交金额 {formatCurrency(report.executionSummary?.totalNotional ?? 0, "USD")}</div>
                  <div>手续费 {formatCurrency(report.pnlAttribution.feeTotal, "USD")}</div>
                </div>
              </div>
              <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(24,34,54,0.72)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">收益归因</div>
                <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                  <div>已实现 {formatCurrency(report.pnlAttribution.realizedPnl, "USD")}</div>
                  <div>未实现 {formatCurrency(report.pnlAttribution.unrealizedPnl, "USD")}</div>
                  <div>汇率影响 {formatCurrency(report.pnlAttribution.fxImpact, "USD")}</div>
                </div>
              </div>
              <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(24,34,54,0.72)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">风控变化</div>
                <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                  <div>回撤 {report.riskDelta.maxDrawdownBefore.toFixed(2)}% → {report.riskDelta.maxDrawdownAfter.toFixed(2)}%</div>
                  <div>集中度 {report.riskDelta.hhiBefore.toFixed(2)}% → {report.riskDelta.hhiAfter.toFixed(2)}%</div>
                  <div>最大漂移 {report.riskDelta.maxDriftBefore.toFixed(2)}% → {report.riskDelta.maxDriftAfter.toFixed(2)}%</div>
                </div>
              </div>
            </div>

            {expanded ? (
              <div className="mt-4 rounded-[16px] border border-dashed border-[var(--border-strong)] bg-[rgba(8,12,20,0.28)] p-4 text-sm text-[var(--muted)]">
                <div>触发源：{triggerSourceLabel(report.triggerSource)}</div>
                <div className="mt-2">前后权益：{formatCurrency(report.beforeSnapshot.totalEquity, "USD")} → {formatCurrency(report.afterSnapshot.totalEquity, "USD")}</div>
                <div className="mt-2">贡献前三：{report.pnlAttribution.topContributors.slice(0, 3).map((item) => `${item.symbol} ${formatCurrency(item.pnl, "USD")}`).join("；") || "-"}</div>
              </div>
            ) : null}
          </div>
        );
      }) : (
        <DashboardEmptyState
          title="暂无复盘报告"
          description="当前还没有可展示的执行复盘；如果这轮只有目标写回、没有真实执行，这里不会生成复盘报告。"
          className="px-5 py-16"
          action={<Link href="/daa/dashboard/workbench?tab=rebalance" className={emptyActionLinkClassName}>去工作台完成一次执行</Link>}
        />
      )}
    </div>
  );
}
