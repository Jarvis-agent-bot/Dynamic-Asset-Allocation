import type { DaaHumanSignalV1 } from "@/src/daa/hf/humanSignalsV1";
import type { DaaNewsSignalV1 } from "@/src/daa/signals/newsSignalV1";
import type { DaaTechnicalSignalV1 } from "@/src/daa/signals/technicalSignalV1";

export type DaaOpportunityActionV1 = "open_or_add" | "watch" | "reduce_or_avoid";

export type DaaFusionWeightsV1 = {
  human: number;
  news: number;
  technical: number;
};

export type DaaFusedOpportunityV1 = {
  symbol: string;
  finalScorePct: number;
  confidencePct: number;
  riskScorePct: number;
  action: DaaOpportunityActionV1;
  scores: {
    human: number;
    news: number;
    technical: number;
    penalty: number;
  };
  weights: DaaFusionWeightsV1;
  reasons: string[];
  sourceRefs: string[];
  human: DaaHumanSignalV1 | null;
  news: DaaNewsSignalV1 | null;
  technical: DaaTechnicalSignalV1 | null;
};

export type BuildFusedOpportunitiesInputV1 = {
  symbols: string[];
  humanSignals: DaaHumanSignalV1[];
  newsSignals: DaaNewsSignalV1[];
  technicalSignals: DaaTechnicalSignalV1[];
  weights?: Partial<DaaFusionWeightsV1>;
};

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

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

function normalizeWeights(weights?: Partial<DaaFusionWeightsV1>): DaaFusionWeightsV1 {
  const human = Math.max(0, Number(weights?.human ?? 0.45) || 0);
  const news = Math.max(0, Number(weights?.news ?? 0.25) || 0);
  const technical = Math.max(0, Number(weights?.technical ?? 0.30) || 0);
  const sum = human + news + technical;
  if (sum <= 1e-9) {
    return { human: 0.45, news: 0.25, technical: 0.3 };
  }
  return {
    human: human / sum,
    news: news / sum,
    technical: technical / sum,
  };
}

function conflictPenalty(input: {
  humanScore: number;
  newsScore: number;
  technicalScore: number;
  humanConfidence: number;
  newsConfidence: number;
  technicalConfidence: number;
}): { penalty: number; reasons: string[] } {
  const reasons: string[] = [];
  let penalty = 0;

  const h = input.humanScore;
  const n = input.newsScore;
  const t = input.technicalScore;

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

  return {
    penalty: clamp(penalty, 0, 25),
    reasons,
  };
}

function inferAction(score: number, confidence: number, riskTags: string[]): DaaOpportunityActionV1 {
  if (riskTags.includes("thesis_drift") || riskTags.includes("weak_actor_quality")) {
    return "reduce_or_avoid";
  }

  if (score >= 72 && confidence >= 58) return "open_or_add";
  if (score >= 56 && confidence >= 42) return "watch";
  return "reduce_or_avoid";
}

export function buildFusedOpportunitiesV1(input: BuildFusedOpportunitiesInputV1): DaaFusedOpportunityV1[] {
  const symbols = [...new Set((input.symbols ?? []).map((x) => normalizeSymbol(x)).filter(Boolean))];
  if (!symbols.length) return [];

  const weights = normalizeWeights(input.weights);

  const humanMap = toMapBySymbol(input.humanSignals ?? []);
  const newsMap = toMapBySymbol(input.newsSignals ?? []);
  const technicalMap = toMapBySymbol(input.technicalSignals ?? []);

  const out: DaaFusedOpportunityV1[] = [];

  for (const symbol of symbols) {
    const human = humanMap.get(symbol) ?? null;
    const news = newsMap.get(symbol) ?? null;
    const technical = technicalMap.get(symbol) ?? null;

    const humanScore = clamp(Number(human?.aggregatedScorePct ?? 50), 0, 100);
    const newsScore = clamp(Number(news?.scorePct ?? 50), 0, 100);
    const technicalScore = clamp(Number(technical?.scorePct ?? 50), 0, 100);

    const humanConfidence = clamp(Number(human?.confidencePct ?? 55), 0, 100);
    const newsConfidence = clamp(Number(news?.confidencePct ?? 40), 0, 100);
    const technicalConfidence = clamp(Number(technical?.confidencePct ?? 45), 0, 100);

    const weighted =
      humanScore * weights.human
      + newsScore * weights.news
      + technicalScore * weights.technical;

    const conflict = conflictPenalty({
      humanScore,
      newsScore,
      technicalScore,
      humanConfidence,
      newsConfidence,
      technicalConfidence,
    });

    const finalScore = clamp(weighted - conflict.penalty, 0, 100);
    const confidence = clamp(
      humanConfidence * 0.5 + newsConfidence * 0.2 + technicalConfidence * 0.3 - conflict.penalty * 0.5,
      0,
      100,
    );

    const riskTags = [...(human?.riskTags ?? [])];
    const action = inferAction(finalScore, confidence, riskTags);

    const reasons: string[] = [];
    if (human) reasons.push(`人因评分 ${humanScore.toFixed(1)}%`);
    if (news) reasons.push(`新闻评分 ${newsScore.toFixed(1)}%`);
    if (technical) reasons.push(`技术评分 ${technicalScore.toFixed(1)}%`);
    reasons.push(...conflict.reasons);
    if (!human && !news && !technical) reasons.push("缺少可用信号，按中性处理");

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
        penalty: Number(conflict.penalty.toFixed(2)),
      },
      weights,
      reasons,
      sourceRefs: [...new Set(sourceRefs)].slice(0, 12),
      human,
      news,
      technical,
    });
  }

  return out.sort((a, b) => b.finalScorePct - a.finalScorePct || b.confidencePct - a.confidencePct || a.symbol.localeCompare(b.symbol));
}
