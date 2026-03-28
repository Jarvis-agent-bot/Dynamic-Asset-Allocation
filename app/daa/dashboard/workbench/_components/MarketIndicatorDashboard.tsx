"use client";

import {
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { SkeletonIndicatorGrid } from "@/app/daa/dashboard/_components/SkeletonPatterns";
import { cn } from "@/lib/utils";
import type { DaaMarketContext } from "@/src/daa/modules/marketContext/marketContextTypes";

import { InvestmentClockWidget } from "./InvestmentClockWidget";
import { macroCyclePhaseLabel, marketRegimeLabel, marketRegimeTone } from "./rebalance";

/* ---------- types ---------- */

type MacroCycle = {
  phase: string;
  growthProxy: number;
  inflationProxy: number;
  confidence: number;
  label: string;
  favoredAssets: string[];
};

type MarketIndicatorDashboardProps = {
  marketContext: (DaaMarketContext & { macroCycle?: MacroCycle | null }) | null;
};

/* ---------- helpers ---------- */

const SCOPE_LABEL_ZH: Record<string, string> = {
  us_equity: "美股",
  hk_cn_equity: "港股 / 中概",
  crypto: "加密市场",
  macro_defensive: "宏观防御",
  macro_global: "宏观全局",
};

function scopeLabelZh(scope: string): string {
  return SCOPE_LABEL_ZH[scope] || scope;
}

function stanceTone(stance: string) {
  if (stance === "risk_off") return "amber" as const;
  if (stance === "risk_on") return "green" as const;
  return "slate" as const;
}

function stanceLabel(stance: string) {
  if (stance === "risk_off") return "偏防守";
  if (stance === "risk_on") return "偏进攻";
  if (stance === "neutral") return "中性";
  return stance;
}

function percentileBarColor(pct: number): string {
  if (pct <= 30) return "bg-emerald-500";
  if (pct <= 70) return "bg-amber-500";
  return "bg-red-500";
}

function trendArrow(pct: number | null | undefined, label: string) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0;
  return (
    <span className={cn("text-[11px] font-medium", up ? "text-emerald-400" : "text-red-400")}>
      {label} {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function normalizePhase(phase: string | undefined | null): "recovery" | "overheating" | "stagflation" | "deflation" | null {
  if (phase === "recovery" || phase === "overheating" || phase === "stagflation" || phase === "deflation") return phase;
  return null;
}

/* ---------- component ---------- */

export function MarketIndicatorDashboard({ marketContext, hideClock }: MarketIndicatorDashboardProps & { hideClock?: boolean }) {
  if (!marketContext) {
    return <SkeletonIndicatorGrid count={12} />;
  }

  const macro = marketContext.macroCycle ?? null;
  const clockPhase = normalizePhase(macro?.phase);
  const indicators = marketContext.indicators || [];
  const scopes = marketContext.scopes || [];

  return (
    <div className="space-y-5">
      {/* Section 1: 投资时钟（无宏观数据或 hideClock 时隐藏） */}
      {!hideClock && clockPhase && (
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">投资时钟</div>
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-4")}>
              <InvestmentClockWidget
                phase={clockPhase}
                growthProxy={macro?.growthProxy}
                inflationProxy={macro?.inflationProxy}
                confidence={macro?.confidence}
              />
            </div>
            <div className={cn(daaSurfaceSubtlePanelClassName, "flex flex-col justify-center px-4 py-4")}>
              <div className="text-sm font-semibold text-[var(--text)]">
                当前阶段: {macroCyclePhaseLabel(clockPhase)} {macro?.label ? `— ${macro.label}` : ""}
              </div>
              {macro?.favoredAssets && macro.favoredAssets.length > 0 ? (
                <div className="mt-2 text-sm text-[var(--muted)]">
                  推荐资产: {macro.favoredAssets.join(", ")}
                </div>
              ) : (
                <div className="mt-2 text-sm text-[var(--muted)]">
                  推荐: {clockPhase === "recovery" ? "股票, 周期品" : clockPhase === "overheating" ? "大宗商品, TIPS" : clockPhase === "stagflation" ? "现金, 黄金" : "债券, 防御股"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section 2: 指标概览 */}
      {indicators.length > 0 ? (
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">指标概览</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {indicators.map((ind) => (
              <div
                key={ind.key}
                className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3.5")}
              >
                {/* 顶部: label + scope */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--text)]">{ind.label}</span>
                  <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[10px] text-[var(--faint)]">
                    {scopeLabelZh(ind.scope)}
                  </span>
                </div>

                {/* 中间: raw value + percentile */}
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="font-[var(--font-mono)] text-lg text-[var(--text)]">
                    {ind.rawValue !== null && ind.rawValue !== undefined ? ind.rawValue.toFixed(2) : "-"}
                  </span>
                  {ind.unit ? <span className="text-xs text-[var(--faint)]">{ind.unit}</span> : null}
                </div>
                {ind.percentile252 !== null && ind.percentile252 !== undefined ? (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] text-[var(--faint)]">
                      <span>252 日分位</span>
                      <span>{ind.percentile252.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                      <div
                        className={cn("h-full rounded-full transition-all", percentileBarColor(ind.percentile252))}
                        style={{ width: `${Math.min(100, Math.max(0, ind.percentile252))}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {/* 底部: trend + stance */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {trendArrow(ind.trend7dPct, "7d")}
                  {trendArrow(ind.trend30dPct, "30d")}
                  <DaaSurfaceStatusPill tone={stanceTone(ind.stance)}>
                    {stanceLabel(ind.stance)}
                  </DaaSurfaceStatusPill>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Section 3: Scope 分析 */}
      {scopes.length > 0 ? (
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">市场区域</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {scopes.map((s) => (
              <div
                key={s.scope}
                className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3.5")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--text)]">{s.label}</span>
                  <DaaSurfaceStatusPill tone={marketRegimeTone(s.regime)}>
                    {marketRegimeLabel(s.regime)}
                  </DaaSurfaceStatusPill>
                </div>
                <div className="mt-2 font-[var(--font-mono)] text-base text-[var(--text)]">
                  建议仓位 {Math.round(s.buyScale * 100)}%
                </div>
                {s.reasons.length > 0 ? (
                  <div className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                    {s.reasons[0]}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
