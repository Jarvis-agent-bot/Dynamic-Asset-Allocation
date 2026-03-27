"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { DashboardEmptyState } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceMiniStat,
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { MarketIndicatorDashboard } from "@/app/daa/dashboard/workbench/_components/MarketIndicatorDashboard";
import { PerformanceChart } from "@/app/daa/dashboard/workbench/_components/PerformanceChart";
import { PortfolioRiskPanel } from "@/app/daa/dashboard/workbench/_components/PortfolioRiskPanel";

const PIE_COLORS = ["#38BDF8", "#818CF8", "#34D399", "#F6AD55", "#F87171", "#A78BFA"];

type CockpitTab = "signals" | "indicators" | "risk";

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

export function WorkbenchCockpitSection(props: {
  model: WorkbenchPageModel;
}) {
  const { model } = props;
  const baseCurrency = model.bootstrap?.baseCurrency || "USD";
  const topSignals = (model.signals || []).slice(0, 6);
  const allocationData = allocationRows(model);
  const totalEquity = model.totalEquity || 0;
  const marketContext = model.bootstrap?.marketContext;
  const [cockpitTab, setCockpitTab] = useState<CockpitTab>("signals");

  return (
    <div className="space-y-4">
      {/* -- Sub-tab navigation -- */}
      <div className="flex gap-1 rounded-lg bg-[rgba(255,255,255,0.04)] p-1" role="tablist">
        {([
          { key: "signals" as const, label: "信号" },
          { key: "indicators" as const, label: "指标" },
          { key: "risk" as const, label: "风控" },
        ]).map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={cockpitTab === tab.key}
            aria-controls={`cockpit-tabpanel-${tab.key}`}
            onClick={() => setCockpitTab(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              cockpitTab === tab.key
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* -- Tab: signals (统一信号) -- */}
      {cockpitTab === "signals" && (
        <DaaSurfacePanel
          accent="amber"
          title="统一信号"
          subtitle="把告警、市场健康和运行状态收束成一条可操作的列表。"
          action={(
            <DaaSurfaceActionButton tone="slate" onClick={() => void model.loadBootstrap(true)} disabled={model.refreshing}>
              <RefreshCcw className={`h-4 w-4 ${model.refreshing ? "animate-spin" : ""}`} />
              刷新工作台
            </DaaSurfaceActionButton>
          )}
        >
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
            <DashboardEmptyState title="当前没有需要强调的信号" description="重构后工作台会优先展示真正需要处理的事项，而不是重复说明文案。" className="border-0 bg-transparent px-0 py-8" />
          )}
        </DaaSurfacePanel>
      )}

      {/* -- Tab: indicators (市场指标面板) -- */}
      {cockpitTab === "indicators" && (
        <DaaSurfacePanel accent="cyan" title="市场指标面板" subtitle="美林投资时钟、全维度指标与 Scope 分析">
          <MarketIndicatorDashboard marketContext={marketContext ?? null} hideClock />
        </DaaSurfacePanel>
      )}

      {/* -- Tab: risk (组合风险) -- */}
      {cockpitTab === "risk" && model.bootstrap ? (
        <SectionErrorBoundary sectionName="组合风险">
          <PortfolioRiskPanel
            bootstrap={model.bootstrap}
            snapshots={model.snapshots ?? []}
            latestCycle={model.bootstrap.latestCycle}
          />
        </SectionErrorBoundary>
      ) : cockpitTab === "risk" ? (
        <DashboardEmptyState title="尚未加载组合数据" description="请等待工作台初始化完成。" />
      ) : null}
    </div>
  );
}
