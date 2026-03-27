"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, RefreshCcw } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { DashboardEmptyState } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { WorkbenchAssistantPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchAssistantPanel";
import { MarketIndicatorDashboard } from "@/app/daa/dashboard/workbench/_components/MarketIndicatorDashboard";
import { PerformanceChart } from "@/app/daa/dashboard/workbench/_components/PerformanceChart";
import { PortfolioRiskPanel } from "@/app/daa/dashboard/workbench/_components/PortfolioRiskPanel";

const PIE_COLORS = ["#38BDF8", "#818CF8", "#34D399", "#F6AD55", "#F87171", "#A78BFA"];

function signalTone(level: "info" | "warn" | "success") {
  if (level === "warn") return "amber" as const;
  if (level === "success") return "green" as const;
  return "cyan" as const;
}

function allocationRows(model: WorkbenchPageModel) {
  const rows = model.allocationSummary?.topHoldings || [];
  const items = rows.map((item) => ({ name: item.symbol, value: item.value }));
  const cashValue = model.allocationSummary?.cashValue || 0;
  if (cashValue > 0) items.push({ name: "现金", value: cashValue });
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible section wrapper
// ─────────────────────────────────────────────────────────────────────────────

function CollapsibleDetail(props: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[rgba(8,12,20,0.5)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--text)] transition-colors hover:bg-[rgba(255,255,255,0.02)]"
      >
        {props.title}
        {open ? <ChevronUp className="h-4 w-4 text-[var(--muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--muted)]" />}
      </button>
      {open && <div className="border-t border-[var(--border)] px-4 py-4">{props.children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main cockpit: summary + collapsible details
// ─────────────────────────────────────────────────────────────────────────────

export function WorkbenchCockpitSection(props: {
  model: WorkbenchPageModel;
}) {
  const { model } = props;
  const baseCurrency = model.bootstrap?.baseCurrency || "USD";
  const topSignals = (model.signals || []).slice(0, 6);
  const allocationData = allocationRows(model);
  const totalEquity = model.totalEquity || 0;
  const marketContext = model.bootstrap?.marketContext;
  const warnSignals = topSignals.filter((s) => s.level === "warn");

  return (
    <div className="space-y-4">
      <SectionErrorBoundary sectionName="交易助手">
        <WorkbenchAssistantPanel assistant={model.assistant} />
      </SectionErrorBoundary>

      {/* ── Summary: Performance + Allocation (always visible) ── */}
      <DaaSurfacePanel
        accent="indigo"
        title="运行摘要"
        subtitle="权益走势与资产分布概览"
        action={(
          <DaaSurfaceActionButton tone="slate" onClick={() => void model.loadBootstrap(true)} disabled={model.refreshing}>
            <RefreshCcw className={`h-4 w-4 ${model.refreshing ? "animate-spin" : ""}`} />
            刷新
          </DaaSurfaceActionButton>
        )}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionErrorBoundary sectionName="Performance chart">
            <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] p-4">
              {!model.snapshots || model.snapshots.length === 0 ? (
                <SkeletonChart />
              ) : (
                <PerformanceChart snapshots={model.snapshots} />
              )}
            </div>
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="Allocation chart">
            <div className="grid gap-3">
              <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] p-4">
                {allocationData.length > 0 && totalEquity > 0 ? (
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={78} paddingAngle={3}>
                          {allocationData.map((item, index) => <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 14 }}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={((value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`) as any}
                        />
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
          </SectionErrorBoundary>
        </div>
      </DaaSurfacePanel>

      {/* ── Collapsible: Signals (默认展开 if warn signals exist) ── */}
      <CollapsibleDetail title={`信号${warnSignals.length > 0 ? ` (${warnSignals.length} 项需处理)` : ""}`} defaultOpen={warnSignals.length > 0}>
        {topSignals.length > 0 ? (
          <div className="space-y-3">
            {topSignals.map((signal) => (
              <div key={signal.id} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.6)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <DaaSurfaceStatusPill tone={signalTone(signal.level)}>
                    {signal.level === "warn" ? "需处理" : signal.level === "success" ? "已就绪" : "观察中"}
                  </DaaSurfaceStatusPill>
                  <span className="text-xs text-[var(--faint)]">{signal.source}</span>
                </div>
                <div className="mt-2 text-sm text-[var(--text)]">{signal.text}</div>
                {signal.actionHref ? (
                  <div className="mt-3">
                    <Link
                      href={signal.actionHref}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--primary)]/28 bg-[rgba(56,189,248,0.08)] px-3 py-1.5 text-xs font-medium text-[var(--primary)] transition-colors hover:border-[var(--primary)]/42 hover:bg-[rgba(56,189,248,0.12)]"
                    >
                      前往处理
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <DashboardEmptyState title="当前没有需要关注的信号" description="" className="border-0 bg-transparent px-0 py-4" />
        )}
      </CollapsibleDetail>

      {/* ── Collapsible: Market Indicators ── */}
      <CollapsibleDetail title="市场指标">
        <MarketIndicatorDashboard marketContext={marketContext ?? null} />
      </CollapsibleDetail>

      {/* ── Collapsible: Portfolio Risk ── */}
      <CollapsibleDetail title="组合风控">
        {model.bootstrap ? (
          <SectionErrorBoundary sectionName="组合风险">
            <PortfolioRiskPanel
              bootstrap={model.bootstrap}
              snapshots={model.snapshots ?? []}
              latestCycle={model.bootstrap.latestCycle}
            />
          </SectionErrorBoundary>
        ) : (
          <DashboardEmptyState title="尚未加载组合数据" description="请等待工作台初始化完成。" />
        )}
      </CollapsibleDetail>
    </div>
  );
}
