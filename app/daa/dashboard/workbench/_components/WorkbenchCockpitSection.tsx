"use client";

import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DashboardEmptyState } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DeepLedgerActionButton,
  DeepLedgerMiniStat,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";

const PIE_COLORS = ["#38BDF8", "#818CF8", "#34D399", "#F6AD55", "#F87171", "#A78BFA"];

function signalTone(level: "info" | "warn" | "success") {
  if (level === "warn") return "amber" as const;
  if (level === "success") return "green" as const;
  return "cyan" as const;
}

function trendRows(model: WorkbenchPageModel) {
  return [...(model.snapshots || [])]
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .slice(-60)
    .map((row) => ({
      label: row.ts.slice(5, 10),
      totalEquity: row.totalEquity,
      holdings: row.holdingsValue,
      cash: row.cash,
    }));
}

function allocationRows(model: WorkbenchPageModel) {
  const rows = model.allocationSummary?.topHoldings || [];
  const items = rows.map((item) => ({ name: item.symbol, value: item.value }));
  const cashValue = model.allocationSummary?.cashValue || 0;
  if (cashValue > 0) items.push({ name: "现金", value: cashValue });
  return items;
}

export function WorkbenchCockpitSection(props: {
  model: WorkbenchPageModel;
}) {
  const { model } = props;
  const baseCurrency = model.bootstrap?.baseCurrency || "USD";
  const topSignals = (model.signals || []).slice(0, 6);
  const trendData = trendRows(model);
  const allocationData = allocationRows(model);
  const totalEquity = model.totalEquity || 0;
  const marketContext = model.bootstrap?.marketContext;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[0.94fr_1.06fr]">
        <DeepLedgerPanel
          accent="amber"
          title="统一信号"
          subtitle="把告警、市场健康、运行状态与总览提示收束成一条可操作的列表。"
          action={(
            <DeepLedgerActionButton tone="slate" onClick={() => void model.loadBootstrap(true)} disabled={model.refreshing}>
              <RefreshCcw className={`h-4 w-4 ${model.refreshing ? "animate-spin" : ""}`} />
              刷新工作台
            </DeepLedgerActionButton>
          )}
        >
          {topSignals.length > 0 ? (
            <div className="space-y-3">
              {topSignals.map((signal) => (
                <div key={signal.id} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.6)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <DeepLedgerStatusPill tone={signalTone(signal.level)}>
                      {signal.level === "warn" ? "需处理" : signal.level === "success" ? "已就绪" : "观察中"}
                    </DeepLedgerStatusPill>
                    <span className="text-xs text-[var(--faint)]">{signal.source}</span>
                  </div>
                  <div className="mt-2 text-sm text-[var(--text)]">{signal.text}</div>
                  {signal.actionHref ? (
                    <div className="mt-3">
                      <Link
                        href={signal.actionHref}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--primary)]/28 bg-[rgba(56,189,248,0.08)] px-3 py-1.5 text-xs font-medium text-[var(--primary)] transition-all hover:border-[var(--primary)]/42 hover:bg-[rgba(56,189,248,0.12)]"
                      >
                        前往处理
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <DashboardEmptyState title="当前没有需要强调的信号" description="重构后工作台会优先展示真正需要处理的事项，而不是重复说明文案。" className="border-0 bg-transparent px-0 py-8" />
          )}
        </DeepLedgerPanel>

        <DeepLedgerPanel
          accent="indigo"
          title="运行摘要"
          subtitle="把权益变化、资产分布与最近一轮市场状态放在同一视图内，减少在总览和工作台之间来回切换。"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <DeepLedgerMiniStat
              label="最近周期"
              value={model.bootstrap?.latestCycle ? model.bootstrap.latestCycle.cycleId.slice(0, 8) : "-"}
              hint={model.bootstrap?.latestCycle ? `${model.bootstrap.latestCycle.triggerSource} · ${model.bootstrap.latestCycle.status}` : "当前没有新周期"}
              tone="indigo"
            />
            <DeepLedgerMiniStat
              label="行情健康"
              value={model.bootstrap?.marketDataHealth?.status || "ok"}
              hint={`新鲜 ${model.bootstrap?.marketDataHealth?.freshCount || 0} · 过期 ${model.bootstrap?.marketDataHealth?.staleCount || 0}`}
              tone={model.bootstrap?.marketDataHealth?.status === "down" ? "red" : model.bootstrap?.marketDataHealth?.status === "degraded" ? "amber" : "green"}
            />
            <DeepLedgerMiniStat
              label="市场依据"
              value={String(marketContext?.reasons.length || 0)}
              hint={marketContext?.scopes?.[0]?.label || "市场状态层"}
              tone="cyan"
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] p-4">
              {trendData.length > 1 ? (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="workbenchEquityFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.34} />
                          <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} width={42} />
                      <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 14 }} />
                      <Area type="monotone" dataKey="totalEquity" stroke="#38BDF8" fill="url(#workbenchEquityFill)" strokeWidth={2.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <DashboardEmptyState title="暂无权益曲线" description="V2 账本启用后，新的权益快照会在入金、交易和后续运行中逐步积累。" className="border-0 bg-transparent px-0 py-10" />
              )}
            </div>

            <div className="grid gap-3">
              <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] p-4">
                {allocationData.length > 0 && totalEquity > 0 ? (
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={78} paddingAngle={3}>
                          {allocationData.map((item, index) => <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 14 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <DashboardEmptyState title="当前没有可分配资产" description="账本重置后，新的持仓会在工作台重新生成。" className="border-0 bg-transparent px-0 py-8" />
                )}
              </div>
              <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--faint)]">Top Holdings</div>
                <div className="mt-3 space-y-3">
                  {(model.allocationSummary?.topHoldings || []).slice(0, 4).map((item) => (
                    <div key={item.assetKey} className="flex items-center justify-between gap-3 text-sm">
                      <div className="font-medium text-[var(--text)]">{item.symbol}</div>
                      <div className="text-right">
                        <div className="text-[var(--text)]">{formatCurrency(item.value, baseCurrency)}</div>
                        <div className="text-xs text-[var(--muted)]">{item.weightPct.toFixed(2)}%</div>
                      </div>
                    </div>
                  ))}
                  {(model.allocationSummary?.topHoldings || []).length === 0 ? (
                    <div className="text-sm text-[var(--muted)]">当前还没有持仓暴露。</div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </DeepLedgerPanel>
      </div>
    </div>
  );
}
