"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCcw } from "lucide-react";

import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { listWorkbenchRebalanceReportsV1, listWorkbenchTradeRecordsV1 } from "@/src/daa/modules/workbench/workbenchApiV1";
import type { WorkbenchRebalanceCycleReportV1, WorkbenchTradeRecordsV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

import { DeepLedgerActionButton, DeepLedgerMetricCard, DeepLedgerPageHeader, DeepLedgerPanel, DeepLedgerStatusPill, toneColor } from "../_components/DeepLedgerUI";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

type TradeTab = "cycles" | "orders" | "reports";

const TAB_META: Record<TradeTab, { label: string; subtitle: string }> = {
  cycles: { label: "再平衡周期", subtitle: "用时间线回顾每一次触发、状态与执行规模。" },
  orders: { label: "订单明细", subtitle: "查看买卖方向、数量、价格、所属周期与更新时间。" },
  reports: { label: "复盘报告", subtitle: "聚焦执行效果、PnL 归因与风险变化。" },
};

const STATUS_TONE: Record<string, "cyan" | "amber" | "green" | "indigo" | "slate"> = {
  generated: "indigo",
  reviewing: "amber",
  executing: "cyan",
  completed: "green",
  cancelled: "slate",
};

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

function triggerSourceLabel(triggerSource: string): string {
  if (triggerSource === "calendar") return "定期触发";
  if (triggerSource === "drift") return "偏移触发";
  if (triggerSource === "risk") return "风险触发";
  return "手动触发";
}

function CycleStatusBadge({ status }: { status: string }) {
  return <DeepLedgerStatusPill tone={STATUS_TONE[status] ?? "slate"}>{cycleStatusLabel(status)}</DeepLedgerStatusPill>;
}

function TableHeadCell({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="border-b border-[var(--border)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function TableCellMono({ children, align = "left", className = "" }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td
      className={`border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--text)] ${className}`}
      style={{ textAlign: align, fontFamily: "var(--font-mono)" }}
    >
      {children}
    </td>
  );
}

function TableCellText({ children, align = "left", className = "" }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td
      className={`border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)] ${className}`}
      style={{ textAlign: align }}
    >
      {children}
    </td>
  );
}

export default function TradesPage() {
  const [data, setData] = useState<WorkbenchTradeRecordsV1>({ cycles: [], orders: [] });
  const [reports, setReports] = useState<WorkbenchRebalanceCycleReportV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expandedReportCycleId, setExpandedReportCycleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TradeTab>("cycles");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [next, nextReports] = await Promise.all([
        listWorkbenchTradeRecordsV1(150),
        listWorkbenchRebalanceReportsV1(120),
      ]);
      setData(next);
      setReports(nextReports);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载交易记录失败");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    function onRefresh() {
      void load(true);
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, [load]);

  const cycles = useMemo(
    () => [...data.cycles].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [data.cycles],
  );
  const orders = useMemo(
    () => [...data.orders].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 300),
    [data.orders],
  );
  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => Date.parse(b.reportCreatedAt) - Date.parse(a.reportCreatedAt)),
    [reports],
  );

  const completedCycleCount = cycles.filter((cycle) => cycle.status === "completed").length;
  const executedOrderCount = orders.filter((row) => row.status === "executed").length;
  const totalNotional = cycles.reduce((sum, cycle) => sum + (cycle.executionSummary?.totalNotional ?? 0), 0);
  const realizedPnl = sortedReports.reduce((sum, report) => sum + report.pnlAttribution.realizedPnl, 0);
  const tabMeta = TAB_META[activeTab];

  return (
    <div className="space-y-6 lg:space-y-7">
      <DeepLedgerPageHeader
        eyebrow="Execution Audit"
        title="交易记录"
        description="以周期为主叙事，把订单、执行结果和复盘报告串成一条可追溯的交易轨迹。"
        actions={(
          <DeepLedgerActionButton onClick={() => void load(true)} disabled={loading || refreshing}>
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "刷新中..." : "刷新数据"}
          </DeepLedgerActionButton>
        )}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DeepLedgerMetricCard label="再平衡周期" value={`${cycles.length}`} subLabel={`已完成 ${completedCycleCount} 个`} accent="cyan" />
        <DeepLedgerMetricCard label="订单记录" value={`${orders.length}`} subLabel={`成交 ${executedOrderCount} 笔`} accent="green" />
        <DeepLedgerMetricCard label="执行金额" value={formatCurrency(totalNotional, "USD")} subLabel="累计周期名义金额" accent="amber" />
        <DeepLedgerMetricCard label="已实现 PnL" value={formatCurrency(realizedPnl, "USD")} subLabel={`复盘报告 ${sortedReports.length} 份`} accent="indigo" />
      </div>

      {error ? (
        <div className="rounded-[18px] border border-[rgba(248,113,113,0.22)] bg-[rgba(248,113,113,0.08)] px-5 py-4 text-sm text-[var(--danger)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">交易记录加载失败</div>
              <div className="mt-1 text-[var(--muted)]">{error}</div>
            </div>
          </div>
        </div>
      ) : null}

      <DeepLedgerPanel accent="slate" title="视图切换" subtitle="周期是一级视角，订单与复盘是二级明细。">
        <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[rgba(8,12,20,0.45)] p-2 sm:grid-cols-3">
          {(Object.keys(TAB_META) as TradeTab[]).map((tab) => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={[
                  "rounded-[14px] px-4 py-3 text-left transition-all",
                  active
                    ? "bg-[var(--elevated)] text-[var(--text)] shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
                    : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
                ].join(" ")}
              >
                <div className="text-sm font-semibold">{TAB_META[tab].label}</div>
                <div className="mt-1 text-xs leading-5 text-[var(--faint)]">{TAB_META[tab].subtitle}</div>
              </button>
            );
          })}
        </div>
      </DeepLedgerPanel>

      {loading ? (
        <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] px-5 py-16 text-center text-sm text-[var(--faint)]">
          正在加载交易记录...
        </div>
      ) : null}

      {!loading && activeTab === "cycles" ? (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
          <DeepLedgerPanel accent="cyan" title={tabMeta.label} subtitle={tabMeta.subtitle}>
            {cycles.length > 0 ? (
              <div className="relative pl-5">
                <div className="absolute left-[9px] top-0 h-full w-px bg-[linear-gradient(180deg,rgba(56,189,248,0.28),rgba(129,140,248,0.12))]" />
                <div className="space-y-4">
                  {cycles.map((cycle) => (
                    <div key={cycle.cycleId} className="relative rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4 sm:p-5">
                      <span className="absolute -left-[20px] top-5 h-3.5 w-3.5 rounded-full border-2 border-[var(--bg)]" style={{ background: toneColor(STATUS_TONE[cycle.status] ?? "slate") }} />
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-[var(--font-mono)] text-sm text-[var(--text)]">{cycle.cycleId.slice(0, 8)}</div>
                          <div className="mt-1 text-sm text-[var(--muted)]">{triggerSourceLabel(cycle.triggerSource)}</div>
                        </div>
                        <CycleStatusBadge status={cycle.status} />
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">订单数</div>
                          <div className="mt-1 font-[var(--font-mono)] text-base text-[var(--text)]">
                            {cycle.executionSummary?.ordersExecuted ?? cycle.executedOrders.length}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">执行金额</div>
                          <div className="mt-1 font-[var(--font-mono)] text-base text-[var(--text)]">
                            {formatCurrency(cycle.executionSummary?.totalNotional ?? 0, "USD")}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">创建时间</div>
                          <div className="mt-1 text-sm text-[var(--muted)]">{new Date(cycle.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] px-5 py-16 text-center text-sm text-[var(--faint)]">
                暂无再平衡周期记录
              </div>
            )}
          </DeepLedgerPanel>

          <DeepLedgerPanel accent="indigo" title="周期统计" subtitle="帮助快速判断触发来源与执行完成度。">
            <div className="space-y-3">
              <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">完成率</div>
                <div className="mt-2 font-[var(--font-mono)] text-2xl text-[var(--text)]">
                  {cycles.length > 0 ? `${((completedCycleCount / cycles.length) * 100).toFixed(1)}%` : "0.0%"}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                {[
                  { label: "定期触发", value: cycles.filter((cycle) => cycle.triggerSource === "calendar").length, tone: "cyan" as const },
                  { label: "偏移触发", value: cycles.filter((cycle) => cycle.triggerSource === "drift").length, tone: "amber" as const },
                  { label: "风险触发", value: cycles.filter((cycle) => cycle.triggerSource === "risk").length, tone: "red" as const },
                  { label: "手动触发", value: cycles.filter((cycle) => cycle.triggerSource === "manual").length, tone: "slate" as const },
                ].map((item) => (
                  <div key={item.label} className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4">
                    <DeepLedgerStatusPill tone={item.tone}>{item.label}</DeepLedgerStatusPill>
                    <div className="mt-3 font-[var(--font-mono)] text-xl text-[var(--text)]">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </DeepLedgerPanel>
        </div>
      ) : null}

      {!loading && activeTab === "orders" ? (
        <DeepLedgerPanel accent="green" title={tabMeta.label} subtitle={tabMeta.subtitle}>
          <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)]">
            <div className="overflow-x-auto daa-scrollbar">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr>
                    <TableHeadCell>订单号</TableHeadCell>
                    <TableHeadCell>代码</TableHeadCell>
                    <TableHeadCell>方向</TableHeadCell>
                    <TableHeadCell align="right">数量</TableHeadCell>
                    <TableHeadCell align="right">价格</TableHeadCell>
                    <TableHeadCell>状态</TableHeadCell>
                    <TableHeadCell>周期</TableHeadCell>
                    <TableHeadCell>更新时间</TableHeadCell>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((row) => (
                    <tr key={row.ticketId} className="transition-colors hover:bg-white/[0.02]">
                      <TableCellMono>{row.ticketId.slice(0, 8)}</TableCellMono>
                      <TableCellMono className="font-semibold text-[var(--primary)]">{row.symbol}</TableCellMono>
                      <TableCellText>
                        <DeepLedgerStatusPill tone={row.side === "BUY" ? "green" : "amber"}>
                          {row.side === "BUY" ? "买入" : "卖出"}
                        </DeepLedgerStatusPill>
                      </TableCellText>
                      <TableCellMono align="right">{row.qty.toFixed(4)}</TableCellMono>
                      <TableCellMono align="right">{formatCurrency(row.price, row.instrumentCurrency)}</TableCellMono>
                      <TableCellText><DeepLedgerStatusPill tone={orderStatusTone(row.status)}>{orderStatusLabel(row.status)}</DeepLedgerStatusPill></TableCellText>
                      <TableCellMono>{row.cycleId ? row.cycleId.slice(0, 8) : "-"}</TableCellMono>
                      <TableCellText>{new Date(row.updatedAt).toLocaleString()}</TableCellText>
                    </tr>
                  ))}
                  {!orders.length ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-[var(--faint)]">
                        暂无订单记录
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </DeepLedgerPanel>
      ) : null}

      {!loading && activeTab === "reports" ? (
        <DeepLedgerPanel accent="amber" title={tabMeta.label} subtitle={tabMeta.subtitle}>
          {sortedReports.length > 0 ? (
            <div className="space-y-4">
              {sortedReports.map((report) => {
                const expanded = expandedReportCycleId === report.cycleId;
                const contributors = report.pnlAttribution.topContributors.slice(0, 3);
                return (
                  <div key={report.cycleId} className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-[var(--font-mono)] text-sm text-[var(--text)]">{report.cycleId.slice(0, 8)}</div>
                        <div className="mt-1 text-sm text-[var(--muted)]">{triggerSourceLabel(report.triggerSource)} · {new Date(report.reportCreatedAt).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <CycleStatusBadge status={report.status} />
                        <button
                          type="button"
                          onClick={() => setExpandedReportCycleId((prev) => (prev === report.cycleId ? null : report.cycleId))}
                          className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--muted)] transition-all hover:border-[var(--primary)]/30 hover:text-[var(--text)]"
                        >
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {expanded ? "收起" : "展开"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-4">
                      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(24,34,54,0.75)] px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">执行金额</div>
                        <div className="mt-2 font-[var(--font-mono)] text-base text-[var(--text)]">{formatCurrency(report.executionSummary?.totalNotional ?? 0, "USD")}</div>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(24,34,54,0.75)] px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">已实现 PnL</div>
                        <div className="mt-2 font-[var(--font-mono)] text-base" style={{ color: report.pnlAttribution.realizedPnl >= 0 ? "var(--success)" : "var(--danger)" }}>
                          {formatCurrency(report.pnlAttribution.realizedPnl, "USD")}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(24,34,54,0.75)] px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">未实现 PnL</div>
                        <div className="mt-2 font-[var(--font-mono)] text-base" style={{ color: report.pnlAttribution.unrealizedPnl >= 0 ? "var(--success)" : "var(--danger)" }}>
                          {formatCurrency(report.pnlAttribution.unrealizedPnl, "USD")}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(24,34,54,0.75)] px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">最大偏移</div>
                        <div className="mt-2 font-[var(--font-mono)] text-base text-[var(--text)]">
                          {report.riskDelta.maxDriftBefore.toFixed(2)}% → {report.riskDelta.maxDriftAfter.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {contributors.length > 0 ? contributors.map((item) => (
                        <DeepLedgerStatusPill key={`${report.cycleId}-${item.symbol}`} tone={item.pnl >= 0 ? "green" : "amber"}>
                          {item.symbol} {formatCurrency(item.pnl, "USD")}
                        </DeepLedgerStatusPill>
                      )) : <DeepLedgerStatusPill tone="slate">暂无主要贡献项</DeepLedgerStatusPill>}
                    </div>

                    {expanded ? (
                      <div className="mt-5 grid gap-3 xl:grid-cols-3">
                        {[
                          {
                            title: "执行摘要",
                            rows: [
                              `成功 ${report.executionSummary?.ordersExecuted ?? 0} 笔`,
                              `失败 ${report.executionSummary?.ordersFailed ?? 0} 笔`,
                              `总费用 ${formatCurrency(report.pnlAttribution.feeTotal, "USD")}`,
                            ],
                          },
                          {
                            title: "风险变化",
                            rows: [
                              `最大回撤 ${report.riskDelta.maxDrawdownBefore.toFixed(2)}% → ${report.riskDelta.maxDrawdownAfter.toFixed(2)}%`,
                              `集中度 HHI ${report.riskDelta.hhiBefore.toFixed(2)} → ${report.riskDelta.hhiAfter.toFixed(2)}`,
                              `最大权重 ${report.riskDelta.maxWeightBefore.toFixed(2)}% → ${report.riskDelta.maxWeightAfter.toFixed(2)}%`,
                            ],
                          },
                          {
                            title: "组合快照",
                            rows: [
                              `执行前权益 ${formatCurrency(report.beforeSnapshot.totalEquity, "USD")}`,
                              `执行后权益 ${formatCurrency(report.afterSnapshot.totalEquity, "USD")}`,
                              `FX 影响 ${formatCurrency(report.pnlAttribution.fxImpact, "USD")}`,
                            ],
                          },
                        ].map((block) => (
                          <div key={block.title} className="rounded-[18px] border border-[var(--border)] bg-[rgba(24,34,54,0.75)] p-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">{block.title}</div>
                            <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
                              {block.rows.map((row) => (
                                <div key={row}>{row}</div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] px-5 py-16 text-center text-sm text-[var(--faint)]">
              暂无复盘报告（未执行或执行后报告尚未生成）
            </div>
          )}
        </DeepLedgerPanel>
      ) : null}
    </div>
  );
}
