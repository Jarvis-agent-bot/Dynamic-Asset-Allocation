"use client";

import { useEffect, useState } from "react";

import {
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { Sparkline } from "@/app/daa/dashboard/_components/Sparkline";
import { SkeletonIndicatorGrid } from "@/app/daa/dashboard/_components/SkeletonPatterns";
import { cn } from "@/lib/utils";
import type {
  DaaAssetBudgetOverlayKey,
  DaaMarketContext,
  DaaMarketIndicatorKey,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import { MARKET_INDICATOR_META_CATALOG } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import {
  isActionableMarketScope,
  marketIndicatorSignalLabelZh,
  marketRegimeEnvironmentLabelZh,
  marketScopeMeaningZh,
  marketScopeMetricLabelZh,
  marketScopePrimaryLabelZh,
} from "@/src/daa/modules/marketContext/marketContextLabels";

import { InvestmentClockWidget } from "./InvestmentClockWidget";
import { macroCyclePhaseLabel, marketRegimeTone } from "./rebalance/rebalanceLabels";

/* ---------- types ---------- */

type MacroCycle = {
  phase: string;
  growthProxy: number;
  inflationProxy: number;
  confidence: number;
  label: string;
  favoredAssets: string[];
};

type MarketContextPanelProps = {
  marketContext: (DaaMarketContext & { macroCycle?: MacroCycle | null }) | null;
};

/* ---------- helpers ---------- */

const SCOPE_LABEL_ZH: Record<string, string> = {
  us_equity: "美股",
  hk_cn_equity: "港股 / 中概",
  crypto: "加密市场",
  macro_defensive: "宏观防御",
  macro_global: "宏观全局",
  macro_policy: "宏观政策",
};

function scopeLabelZh(scope: string): string {
  return SCOPE_LABEL_ZH[scope] || scope;
}

function riskScoreTone(scorePct: number | null | undefined) {
  const score = Number.isFinite(scorePct) ? Number(scorePct) : 50;
  if (score >= 80) return "danger" as const;
  if (score >= 65) return "warning" as const;
  if (score <= 35) return "success" as const;
  return "neutral" as const;
}

function indicatorSignalLabel(indicator: DaaMarketContext["indicators"][number]) {
  if (isActionableMarketScope(indicator.scope)) {
    return marketIndicatorSignalLabelZh(indicator);
  }
  return marketScopePrimaryLabelZh(indicator);
}

function percentileProgressClass(pct: number): string {
  if (pct <= 30) {
    return "accent-[var(--success)] [&::-moz-progress-bar]:bg-[var(--success)] [&::-webkit-progress-value]:bg-[var(--success)]";
  }
  if (pct <= 70) {
    return "accent-[var(--amber)] [&::-moz-progress-bar]:bg-[var(--amber)] [&::-webkit-progress-value]:bg-[var(--amber)]";
  }
  return "accent-[var(--danger)] [&::-moz-progress-bar]:bg-[var(--danger)] [&::-webkit-progress-value]:bg-[var(--danger)]";
}

function trendArrow(pct: number | null | undefined, label: string) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0;
  return (
    <span className={cn("text-[11px] font-medium", up ? "text-[var(--success)]" : "text-[var(--danger)]")}>
      {label} {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function normalizePhase(phase: string | undefined | null): "recovery" | "overheating" | "stagflation" | "deflation" | null {
  if (phase === "recovery" || phase === "overheating" || phase === "stagflation" || phase === "deflation") return phase;
  return null;
}

/* ---------- sparkline history hook ---------- */

type SparklineHistoryMap = Record<string, number[]>;

function useIndicatorSparklines(indicatorKeys: DaaMarketIndicatorKey[]): SparklineHistoryMap {
  const [history, setHistory] = useState<SparklineHistoryMap>({});
  const keysStr = indicatorKeys.join(",");

  useEffect(() => {
    if (!keysStr) return;

    const url = `/api/daa/store/market-indicators/history?keys=${encodeURIComponent(keysStr)}&days=30`;

    let cancelled = false;
    fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((historyPayload) => {
        if (cancelled || !historyPayload?.history) return;
        const sparklineHistory: SparklineHistoryMap = {};
        for (const [indicatorKey, snapshots] of Object.entries(historyPayload.history)) {
          const indicatorSnapshots = snapshots as Array<{ rawValue: number | null }>;
          const values = indicatorSnapshots
            .map((snapshot) => snapshot.rawValue)
            .filter((value): value is number => value !== null && Number.isFinite(value));
          if (values.length >= 2) {
            sparklineHistory[indicatorKey] = values;
          }
        }
        setHistory(sparklineHistory);
      })
      .catch(() => {
        /* 静默失败 — sparkline 为可选增强 */
      });

    return () => {
      cancelled = true;
    };
  }, [keysStr]);

  return history;
}

function sparklineColor(data: number[]): string {
  if (data.length < 2) return "var(--primary)";
  return data[data.length - 1] >= data[0] ? "var(--success)" : "var(--danger)";
}

function assetBudgetStanceLabel(stance: string): string {
  if (stance === "increase") return "提高预算";
  if (stance === "reduce") return "降低预算";
  return "维持中性";
}

function asAssetBudgetKey(scope: string): DaaAssetBudgetOverlayKey | null {
  if (
    scope === "us_equity"
    || scope === "hk_cn_equity"
    || scope === "crypto"
    || scope === "duration_bonds"
    || scope === "short_bonds_cash"
    || scope === "gold_commodities"
  ) {
    return scope;
  }
  return null;
}

/* ---------- component ---------- */

export function MarketContextPanel({ marketContext, hideClock }: MarketContextPanelProps & { hideClock?: boolean }) {
  const indicators = marketContext?.indicators || [];
  const indicatorKeys = indicators.map((ind) => ind.key);
  const sparklines = useIndicatorSparklines(indicatorKeys);

  if (!marketContext) {
    return <SkeletonIndicatorGrid count={12} />;
  }

  const macro = marketContext.macroCycle ?? null;
  const macroPolicy = marketContext.macroPolicy ?? null;
  const assetBudgets = marketContext.assetBudgets || [];
  const assetBudgetByScope = new Map(assetBudgets.map((budget) => [budget.key, budget] as const));
  const clockPhase = normalizePhase(macro?.phase);
  const scopes = marketContext.scopes || [];

  return (
    <div className="space-y-5">
      {/* Section 1: 投资时钟（无宏观数据或 hideClock 时隐藏） */}
      {!hideClock && clockPhase && (
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-normal text-[var(--faint)]">投资时钟</div>
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

      {macroPolicy ? (
        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-normal text-[var(--faint)]">政策环境</div>
            <div className="max-w-[520px] text-[11px] leading-5 text-[var(--muted)]">
              PPI、降息路径、缩表和流动性统一解释政策压力；不会单独触发订单。
            </div>
          </div>
          <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">{macroPolicy.label}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  政策压力 {macroPolicy.pressurePct.toFixed(0)}/100 · 置信度 {macroPolicy.confidencePct.toFixed(0)}%
                </div>
              </div>
              <DaaSurfaceStatusPill tone={riskScoreTone(macroPolicy.pressurePct)}>
                {marketRegimeEnvironmentLabelZh(macroPolicy.regime)}
              </DaaSurfaceStatusPill>
            </div>
            {macroPolicy.reasons.length > 0 ? (
              <div className="mt-3 text-xs leading-5 text-[var(--muted)]">{macroPolicy.reasons[0]}</div>
            ) : null}
            <div className="mt-3 grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--elevated)] bg-[var(--surface)] md:grid-cols-3 [&>*:last-child]:border-b-0 md:[&>*:last-child]:border-r-0">
              {macroPolicy.dimensions.map((dimension) => (
                <div
                  key={dimension.key}
                  className="border-b border-[var(--elevated)] px-3 py-2.5 md:border-b-0 md:border-r"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text)]">{dimension.label}</span>
                    <DaaSurfaceStatusPill tone={riskScoreTone(dimension.pressurePct)}>
                      {dimension.pressurePct.toFixed(0)}
                    </DaaSurfaceStatusPill>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--faint)]">
                    置信度 {dimension.confidencePct.toFixed(0)}% · {dimension.sourceIndicators.length} 个输入
                  </div>
                  {dimension.reasons[0] ? (
                    <div className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{dimension.reasons[0]}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {assetBudgets.length > 0 ? (
        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-normal text-[var(--faint)]">预算口径</div>
            <div className="max-w-[520px] text-[11px] leading-5 text-[var(--muted)]">
              宏观政策和市场区域合成后的资产预算系数；用于审阅建议规模和方向。
            </div>
          </div>
          <div className={cn(daaSurfaceSubtlePanelClassName, "overflow-hidden p-0")}>
            {assetBudgets.map((budget) => (
              <div key={budget.key} className="grid gap-3 border-b border-[var(--elevated)] px-4 py-3.5 last:border-b-0 md:grid-cols-[minmax(150px,0.8fr)_minmax(160px,0.7fr)_1fr] md:items-start">
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">{budget.label}</div>
                  <div className="mt-1 text-[11px] text-[var(--faint)]">置信度 {budget.confidencePct.toFixed(0)}%</div>
                </div>
                <div>
                  <DaaSurfaceStatusPill tone={riskScoreTone(budget.pressurePct)}>
                    {assetBudgetStanceLabel(budget.stance)}
                  </DaaSurfaceStatusPill>
                  <div className="mt-2 font-[var(--font-mono)] text-base text-[var(--text)]">
                    预算系数 {Math.round(budget.budgetScale * 100)}%
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--faint)]">
                    压力 {budget.pressurePct.toFixed(0)}/100
                  </div>
                </div>
                <div className="text-xs leading-5 text-[var(--muted)]">
                  {budget.reasons[0] ?? "暂无额外复核说明。"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Section 2: 指标概览 */}
      {indicators.length > 0 ? (
        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-normal text-[var(--faint)]">指标依据</div>
            <div className="max-w-[520px] text-[11px] leading-5 text-[var(--muted)]">
              单项指标用于解释风险来源；预算口径才是调仓审阅使用的统一入口。
            </div>
          </div>
          <div className={cn(daaSurfaceSubtlePanelClassName, "overflow-hidden p-0")}>
            {indicators.map((ind) => {
              const meaning = MARKET_INDICATOR_META_CATALOG[ind.key]?.meaning;
              return (
                <div
                  key={ind.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => window.location.href = `/daa/dashboard/rebalance/indicator/${encodeURIComponent(ind.key)}`}
                  onKeyDown={(e) => { if (e.key === "Enter") window.location.href = `/daa/dashboard/rebalance/indicator/${encodeURIComponent(ind.key)}`; }}
                  className="grid cursor-pointer gap-3 border-b border-[var(--elevated)] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--elevated)]/40 md:grid-cols-[minmax(160px,0.8fr)_minmax(180px,1fr)_minmax(160px,0.7fr)_minmax(170px,0.8fr)] md:items-center"
                >
                  {/* 顶部: label + scope */}
                  <div>
                    <div className="text-sm font-semibold text-[var(--text)]">{ind.label}</div>
                    <span className="rounded-[var(--radius-sm)] bg-[var(--elevated)] px-2 py-0.5 text-[10px] text-[var(--faint)]">
                      {scopeLabelZh(ind.scope)}
                    </span>
                  </div>

                  <div className="text-xs leading-5 text-[var(--muted)]">
                    {meaning?.measurement ?? "暂无指标说明。"}
                  </div>

                  {/* 中间: raw value + sparkline + percentile */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="font-[var(--font-mono)] text-lg text-[var(--text)]">
                          {ind.rawValue !== null && ind.rawValue !== undefined ? ind.rawValue.toFixed(2) : "-"}
                        </span>
                        {ind.unit ? <span className="text-xs text-[var(--faint)]">{ind.unit}</span> : null}
                      </div>
                      {sparklines[ind.key] && (
                        <Sparkline
                          data={sparklines[ind.key]}
                          width={56}
                          height={20}
                          color={sparklineColor(sparklines[ind.key])}
                        />
                      )}
                    </div>
                    {ind.percentile252 !== null && ind.percentile252 !== undefined ? (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[10px] text-[var(--faint)]">
                          <span>252 日分位</span>
                          <span>{ind.percentile252.toFixed(0)}%</span>
                        </div>
                        <progress
                          className={cn(
                            "mt-1 h-1.5 w-full appearance-none overflow-hidden rounded-[var(--radius-sm)] bg-[var(--elevated)] [&::-webkit-progress-bar]:bg-[var(--elevated)]",
                            percentileProgressClass(ind.percentile252),
                          )}
                          max={100}
                          value={Math.min(100, Math.max(0, ind.percentile252))}
                          aria-label={`${ind.label} 252 日分位`}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {trendArrow(ind.trend7dPct, "7d")}
                    {trendArrow(ind.trend30dPct, "30d")}
                    {sparklines[ind.key] && (
                      <span className="text-[10px] text-[var(--faint)]">30 日走势</span>
                    )}
                    <DaaSurfaceStatusPill tone={riskScoreTone(ind.riskOffScorePct)}>
                      {indicatorSignalLabel(ind)}
                    </DaaSurfaceStatusPill>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Section 3: Scope 分析 */}
      {scopes.length > 0 ? (
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-normal text-[var(--faint)]">市场区域结论</div>
          <div className={cn(daaSurfaceSubtlePanelClassName, "overflow-hidden p-0")}>
            {scopes.map((scopeSnapshot) => (
              <div
                key={scopeSnapshot.scope}
                className="grid gap-3 border-b border-[var(--elevated)] px-4 py-3.5 last:border-b-0 md:grid-cols-[minmax(150px,0.8fr)_minmax(160px,0.7fr)_1fr] md:items-start"
              >
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">{scopeSnapshot.label}</div>
                  <div className="mt-1 text-[11px] text-[var(--faint)]">
                    {marketRegimeEnvironmentLabelZh(scopeSnapshot.regime)}
                  </div>
                </div>
                <div>
                  <DaaSurfaceStatusPill tone={marketRegimeTone(scopeSnapshot.regime)}>
                    {marketScopePrimaryLabelZh(scopeSnapshot)}
                  </DaaSurfaceStatusPill>
                  <div className="mt-2 font-[var(--font-mono)] text-base text-[var(--text)]">
                    {(() => {
                      const budgetKey = asAssetBudgetKey(scopeSnapshot.scope);
                      const budget = budgetKey ? assetBudgetByScope.get(budgetKey) : null;
                      if (budget) return `资产预算 ${Math.round(budget.budgetScale * 100)}%`;
                      return `${marketScopeMetricLabelZh(scopeSnapshot.scope)} ${Math.round(scopeSnapshot.riskOffScorePct)}/100`;
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-xs leading-5 text-[var(--faint)]">
                    {marketScopeMeaningZh(scopeSnapshot.scope)}
                  </div>
                  {scopeSnapshot.reasons.length > 0 ? (
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                      {scopeSnapshot.reasons[0]}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
