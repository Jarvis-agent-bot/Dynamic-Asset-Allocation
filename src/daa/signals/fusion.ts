import { clamp } from "@/src/core/math";
import type { DaaHumanSignal } from "@/src/daa/hf/humanSignals";
import type { MacroCyclePhase } from "@/src/daa/modules/marketContext/marketContextTypes";
import type { DaaNewsSignal } from "@/src/daa/signals/newsSignal";
import type { DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";
import type { DaaValuationSignal } from "@/src/daa/signals/valuationSignal";

export type DaaOpportunityAction = "open_or_add" | "watch" | "reduce_or_avoid";

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
  action: DaaOpportunityAction;
  scores: {
    human: number;
    news: number;
    technical: number;
    valuation: number;
    penalty: number;
  };
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
  weights?: Partial<DaaFusionWeights>;
  macroCyclePhase?: MacroCyclePhase | null;
  assetClasses?: Record<string, string>;
};


function normalizeSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function toMapBySymbol<T extends { symbol: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = normalizeSymbol(item.symbol);
    if (!key) continue;
    map.set(key, item);
  }
  return map;
}

function normalizeWeights(weights?: Partial<DaaFusionWeights>): DaaFusionWeights {
  const human = Math.max(0, Number(weights?.human ?? 0.35) || 0);
  const news = Math.max(0, Number(weights?.news ?? 0.2) || 0);
  const technical = Math.max(0, Number(weights?.technical ?? 0.25) || 0);
  const valuation = Math.max(0, Number(weights?.valuation ?? 0.2) || 0);
  const sum = human + news + technical + valuation;
  if (sum <= 1e-9) {
    return { human: 0.35, news: 0.2, technical: 0.25, valuation: 0.2 };
  }
  return {
    human: human / sum,
    news: news / sum,
    technical: technical / sum,
    valuation: valuation / sum,
  };
}

function conflictPenalty(input: {
  humanScore: number;
  newsScore: number;
  technicalScore: number;
  valuationScore: number;
  humanConfidence: number;
  newsConfidence: number;
  technicalConfidence: number;
  valuationConfidence: number;
}): { penalty: number; reasons: string[] } {
  const reasons: string[] = [];
  let penalty = 0;

  const h = input.humanScore;
  const n = input.newsScore;
  const t = input.technicalScore;
  const v = input.valuationScore;

  if (h >= 65 && t <= 40 && input.humanConfidence >= 55 && input.technicalConfidence >= 45) {
    penalty += 9;
    reasons.push("人因与技术信号冲突");
  }

  if (n >= 62 && t <= 40 && input.newsConfidence >= 50 && input.technicalConfidence >= 45) {
    penalty += 7;
    reasons.push("新闻与技术信号冲突");
  }

  if (h <= 40 && t >= 65 && input.humanConfidence >= 50 && input.technicalConfidence >= 50) {
    penalty += 5;
    reasons.push("人因偏弱但技术偏强");
  }

  if (t >= 72 && v <= 35 && input.technicalConfidence >= 50 && input.valuationConfidence >= 40) {
    penalty += 4;
    reasons.push("技术偏强但估值偏贵");
  }

  if (t <= 35 && v >= 65 && input.technicalConfidence >= 45 && input.valuationConfidence >= 40) {
    penalty += 3;
    reasons.push("估值偏便宜但技术趋势仍弱");
  }

  return {
    penalty: clamp(penalty, 0, 25),
    reasons,
  };
}

const MACRO_PHASE_LABEL_: Record<MacroCyclePhase, string> = {
  recovery: "复苏",
  overheating: "过热",
  stagflation: "滞胀",
  deflation: "衰退",
};

function macroCycleAdjustment(phase: MacroCyclePhase | null | undefined, assetClass: string | null | undefined): number {
  if (!phase || !assetClass) return 0;
  const cls = assetClass.toUpperCase();
  if (phase === "stagflation") {
    if (cls === "EQUITY" || cls === "ETF") return -5;
    if (cls === "COMMODITY") return 5;
  }
  if (phase === "deflation") {
    if (cls === "BOND") return 5;
    if (cls === "COMMODITY") return -3;
  }
  if (phase === "overheating") {
    if (cls === "COMMODITY") return 3;
  }
  if (phase === "recovery") {
    if (cls === "EQUITY" || cls === "ETF") return 3;
  }
  return 0;
}

function inferAction(score: number, confidence: number, riskTags: string[]): DaaOpportunityAction {
  if (riskTags.includes("thesis_drift") || riskTags.includes("weak_actor_quality")) {
    return "reduce_or_avoid";
  }

  if (score >= 72 && confidence >= 58) return "open_or_add";
  if (score >= 56 && confidence >= 42) return "watch";
  return "reduce_or_avoid";
}

export function buildFusedOpportunities(input: BuildFusedOpportunitiesInput): DaaFusedOpportunity[] {
  const symbols = [...new Set((input.symbols ?? []).map((x) => normalizeSymbol(x)).filter(Boolean))];
  if (!symbols.length) return [];

  const weights = normalizeWeights(input.weights);

  const humanMap = toMapBySymbol(input.humanSignals ?? []);
  const newsMap = toMapBySymbol(input.newsSignals ?? []);
  const technicalMap = toMapBySymbol(input.technicalSignals ?? []);
  const valuationMap = toMapBySymbol(input.valuationSignals ?? []);

  const out: DaaFusedOpportunity[] = [];

  for (const symbol of symbols) {
    const human = humanMap.get(symbol) ?? null;
    const news = newsMap.get(symbol) ?? null;
    const technical = technicalMap.get(symbol) ?? null;
    const valuation = valuationMap.get(symbol) ?? null;

    const humanScore = clamp(Number(human?.aggregatedScorePct ?? 50), 0, 100);
    const newsScore = clamp(Number(news?.scorePct ?? 50), 0, 100);
    const technicalScore = clamp(Number(technical?.scorePct ?? 50), 0, 100);
    const valuationScore = clamp(Number(valuation?.scorePct ?? 50), 0, 100);

    const humanConfidence = clamp(Number(human?.confidencePct ?? 55), 0, 100);
    const newsConfidence = clamp(Number(news?.confidencePct ?? 40), 0, 100);
    const technicalConfidence = clamp(Number(technical?.confidencePct ?? 45), 0, 100);
    const valuationConfidence = clamp(Number(valuation?.confidencePct ?? 40), 0, 100);

    const weighted =
      humanScore * weights.human
      + newsScore * weights.news
      + technicalScore * weights.technical
      + valuationScore * weights.valuation;

    const conflict = conflictPenalty({
      humanScore,
      newsScore,
      technicalScore,
      valuationScore,
      humanConfidence,
      newsConfidence,
      technicalConfidence,
      valuationConfidence,
    });

    const assetClass = input.assetClasses?.[symbol] ?? null;
    const macroAdj = macroCycleAdjustment(input.macroCyclePhase, assetClass);
    const finalScore = clamp(weighted + macroAdj - conflict.penalty, 0, 100);
    const confidence = clamp(
      humanConfidence * 0.42
      + newsConfidence * 0.2
      + technicalConfidence * 0.23
      + valuationConfidence * 0.15
      - conflict.penalty * 0.45,
      0,
      100,
    );

    const riskTags = [...(human?.riskTags ?? [])];
    const action = inferAction(finalScore, confidence, riskTags);

    const reasons: string[] = [];
    if (human) reasons.push(`人因评分 ${humanScore.toFixed(1)}%`);
    if (news) reasons.push(`新闻评分 ${newsScore.toFixed(1)}%`);
    if (technical) reasons.push(`技术评分 ${technicalScore.toFixed(1)}%`);
    if (valuation) reasons.push(`估值评分 ${valuationScore.toFixed(1)}%`);
    reasons.push(...conflict.reasons);
    if (macroAdj !== 0 && input.macroCyclePhase) {
      const phaseLabel = MACRO_PHASE_LABEL_[input.macroCyclePhase];
      const sign = macroAdj > 0 ? "+" : "";
      reasons.push(`宏观周期（${phaseLabel}）：${assetClass ?? "?"} ${sign}${macroAdj}`);
    }
    if (!human && !news && !technical && !valuation) reasons.push("缺少可用信号，按中性处理");

    const sourceRefs = [
      ...(human?.sourceRefs ?? []),
      ...(news?.items ?? []).map((item) => item.link || "").filter(Boolean),
    ];

    const riskScorePct = clamp(100 - finalScore + (riskTags.length > 0 ? Math.min(18, riskTags.length * 4) : 0), 0, 100);

    out.push({
      symbol,
      finalScorePct: Number(finalScore.toFixed(2)),
      confidencePct: Number(confidence.toFixed(2)),
      riskScorePct: Number(riskScorePct.toFixed(2)),
      action,
      scores: {
        human: Number(humanScore.toFixed(2)),
        news: Number(newsScore.toFixed(2)),
        technical: Number(technicalScore.toFixed(2)),
        valuation: Number(valuationScore.toFixed(2)),
        penalty: Number(conflict.penalty.toFixed(2)),
      },
      weights,
      reasons,
      sourceRefs: [...new Set(sourceRefs)].slice(0, 12),
      human,
      news,
      technical,
      valuation,
    });
  }

  return out.sort((a, b) => b.finalScorePct - a.finalScorePct || b.confidencePct - a.confidencePct || a.symbol.localeCompare(b.symbol));
}
