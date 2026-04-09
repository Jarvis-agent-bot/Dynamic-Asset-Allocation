/**
 * 信号融合类型定义 — 保留类型导出供 opportunityService 等模块使用。
 *
 * 旧的 buildFusedOpportunities() 函数已被 Cognitive Agent 替代。
 * opportunityService 仍使用此函数为资产详情页 (insights) 提供信号概览。
 */

import { clamp } from "@/src/core/math";
import { DEFAULT_STRATEGY_PARAMS, type DaaStrategyParams } from "@/src/daa/config/systemConfig";
import type { DaaHumanSignal } from "@/src/daa/hf/humanSignals";
import type { MacroCyclePhase } from "@/src/daa/modules/marketContext/marketContextTypes";
import type { DaaNewsSignal } from "@/src/daa/signals/newsSignal";
import type { DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";
import type { DaaValuationSignal } from "@/src/daa/signals/valuationSignal";

// ── 类型导出 ──

export type DaaFusionWeights = {
  human: number;
  news: number;
  technical: number;
  valuation: number;
};

export type DaaFusedOpportunity = {
  symbol: string;
  finalScorePct: number;
  confidencePct: number;
  riskScorePct: number;
  action: "open_or_add" | "watch" | "reduce_or_avoid";
  scores: { human: number; news: number; technical: number; valuation: number; penalty: number };
  weights: DaaFusionWeights;
  reasons: string[];
  sourceRefs: string[];
  human: DaaHumanSignal | null;
  news: DaaNewsSignal | null;
  technical: DaaTechnicalSignal | null;
  valuation: DaaValuationSignal | null;
};

export type BuildFusedOpportunitiesInput = {
  symbols: string[];
  humanSignals: DaaHumanSignal[];
  newsSignals: DaaNewsSignal[];
  technicalSignals: DaaTechnicalSignal[];
  valuationSignals: DaaValuationSignal[];
  weights?: DaaFusionWeights;
  macroCyclePhase?: MacroCyclePhase | null;
  assetClasses?: Record<string, string>;
};

// ── 简化的融合函数（保留供 opportunityService 使用）──

export function buildFusedOpportunities(
  input: BuildFusedOpportunitiesInput,
  strategyParams?: Partial<DaaStrategyParams>,
): DaaFusedOpportunity[] {
  const weights: DaaFusionWeights = input.weights ?? { human: 0.35, news: 0.2, technical: 0.25, valuation: 0.2 };
  const humanMap = new Map(input.humanSignals.map(s => [s.symbol.toUpperCase(), s]));
  const newsMap = new Map(input.newsSignals.map(s => [s.symbol.toUpperCase(), s]));
  const techMap = new Map(input.technicalSignals.map(s => [s.symbol.toUpperCase(), s]));
  const valMap = new Map(input.valuationSignals.map(s => [s.symbol.toUpperCase(), s]));

  return input.symbols.map(symbol => {
    const sym = symbol.toUpperCase();
    const h = humanMap.get(sym);
    const n = newsMap.get(sym);
    const t = techMap.get(sym);
    const v = valMap.get(sym);

    const scores = {
      human: h?.aggregatedScorePct ?? 50,
      news: n?.scorePct ?? 50,
      technical: t?.scorePct ?? 50,
      valuation: v?.scorePct ?? 50,
      penalty: 0,
    };

    const finalScorePct = clamp(
      scores.human * weights.human +
      scores.news * weights.news +
      scores.technical * weights.technical +
      scores.valuation * weights.valuation,
      0, 100,
    );

    const confidencePct = clamp(
      (h?.confidencePct ?? 30) * weights.human +
      (n?.confidencePct ?? 30) * weights.news +
      (t?.confidencePct ?? 30) * weights.technical +
      (v?.confidencePct ?? 30) * weights.valuation,
      0, 100,
    );

    const action = finalScorePct >= 62 && confidencePct >= 50
      ? "open_or_add" as const
      : finalScorePct >= 45
        ? "watch" as const
        : "reduce_or_avoid" as const;

    return {
      symbol,
      finalScorePct,
      confidencePct,
      riskScorePct: 100 - finalScorePct,
      action,
      scores,
      weights,
      reasons: [n, t, v].flatMap(s => s?.reasons ?? []).slice(0, 5),
      sourceRefs: n?.items?.map(i => i.link).filter(Boolean) as string[] ?? [],
      human: h ?? null,
      news: n ?? null,
      technical: t ?? null,
      valuation: v ?? null,
    };
  });
}
