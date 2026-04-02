"use client";

import {
  DaaSurfaceEmptyState,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { MarketIndicatorDashboard } from "@/app/daa/dashboard/workbench/_components/MarketIndicatorDashboard";
import { RebalanceAiInsight } from "@/app/daa/dashboard/workbench/_components/rebalance";
import type { DaaMarketContext } from "@/src/daa/modules/marketContext/marketContextTypes";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";

type Signal = {
  id: string;
  level: "info" | "warn" | "success";
  source: string;
  text: string;
  actionHref?: string | null;
};

function signalTone(level: "info" | "warn" | "success") {
  if (level === "warn") return "amber" as const;
  if (level === "success") return "green" as const;
  return "cyan" as const;
}

function signalLabel(level: "info" | "warn" | "success") {
  if (level === "warn") return "注意";
  if (level === "success") return "正常";
  return "信息";
}

export function MarketIntel(props: {
  marketContext: (DaaMarketContext & { macroCycle?: { phase: string; growthProxy: number; inflationProxy: number; confidence: number; label: string; favoredAssets: string[] } | null }) | null;
  signals: Signal[];
  currentCycle: RebalanceCycle | null;
}) {
  const topSignals = (props.signals || []).slice(0, 6);

  return (
    <div className="space-y-4">
      {/* ── 调仓环境分析 ── */}
      <SectionErrorBoundary sectionName="调仓环境">
        <RebalanceAiInsight currentCycle={props.currentCycle} />
      </SectionErrorBoundary>

      {/* ── 提醒信息（纯展示，不跳转） ── */}
      {topSignals.length > 0 ? (
        <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">提醒</div>
          <div className="space-y-2">
            {topSignals.map((signal) => (
              <div key={signal.id} className="flex items-start gap-3 rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.5)] px-4 py-3">
                <DaaSurfaceStatusPill tone={signalTone(signal.level)}>
                  {signalLabel(signal.level)}
                </DaaSurfaceStatusPill>
                <div className="min-w-0 flex-1 text-sm text-[var(--text)]">{signal.text}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── 市场指标仪表盘 ── */}
      {props.marketContext ? (
        <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">市场指标</div>
          <SectionErrorBoundary sectionName="市场指标">
            <MarketIndicatorDashboard marketContext={props.marketContext} hideClock />
          </SectionErrorBoundary>
        </div>
      ) : (
        <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-4">
          <DaaSurfaceEmptyState
            title="市场环境数据暂未就绪"
            description="前往设置页面刷新市场状态层，或等待定时任务自动采集指标数据。"
            className="py-10"
          />
        </div>
      )}
    </div>
  );
}
