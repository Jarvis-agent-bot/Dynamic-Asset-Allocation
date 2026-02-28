import type { DaaMomentumRegimeV1, DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

export type JiguBaoValuationSignalV1 = "undervalued" | "neutral" | "overvalued";
export type JiguBaoActionV1 = "buy_on_dips" | "trim_rebalance" | "hold_watch" | "isolate_exit";

export type JiguBaoSymbolInsightV1 = {
  symbol: string;
  market: string;
  currentWeightPct: number;
  targetWeightPct: number;
  allocationGapPct: number;
  valuationScore: number;
  valuationSignal: JiguBaoValuationSignalV1;
  humanScorePct: number;
  thesisDriftPct: number;
  momentum: DaaMomentumRegimeV1;
  isValueTrap: boolean;
  suggestedAction: JiguBaoActionV1;
  suggestedNotional: number;
  confidencePct: number;
};

export type JiguBaoModuleReportV1 = {
  generatedAt: string;
  totalEquity: number;
  coveragePct: number;
  symbols: JiguBaoSymbolInsightV1[];
  stats: {
    symbolCount: number;
    undervaluedCount: number;
    neutralCount: number;
    overvaluedCount: number;
    valueTrapCount: number;
  };
  notes: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function toFiniteNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(min: number, value: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clamp01(v: number): number {
  return clamp(0, v, 1);
}

function normalizeSymbol(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

function normalizeMarket(raw: unknown): string {
  const value = String(raw ?? "").trim().toUpperCase();
  return value || "UNKNOWN";
}

function normalizeMomentum(raw: unknown): DaaMomentumRegimeV1 {
  if (raw === "strong") return "strong";
  if (raw === "weak") return "weak";
  return "neutral";
}

function momentumScore(momentum: DaaMomentumRegimeV1): number {
  if (momentum === "strong") return 1;
  if (momentum === "weak") return -1;
  return 0;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const tag of raw) {
    const v = String(tag ?? "").trim().toLowerCase();
    if (!v) continue;
    out.add(v);
  }
  return [...out];
}

function hasSbTag(tags: string[]): boolean {
  return tags.some((tag) => tag === "sb" || tag === "sb-isolated" || tag === "isolated");
}

function normalizeTargetWeights(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: Record<string, number> = {};
  let sum = 0;
  for (const [symbolRaw, weightRaw] of Object.entries(raw as Record<string, unknown>)) {
    const symbol = normalizeSymbol(symbolRaw);
    if (!symbol) continue;

    const pct = clamp01(toFiniteNumber(weightRaw, 0));
    if (pct <= 0) continue;

    out[symbol] = pct;
    sum += pct;
  }

  if (sum <= 1.000001) return out;

  const scaled: Record<string, number> = {};
  for (const [symbol, value] of Object.entries(out)) {
    scaled[symbol] = value / sum;
  }
  return scaled;
}

function analystScorePct(raw: unknown): number {
  const row = (raw ?? {}) as Record<string, unknown>;

  const accuracy = clamp01(toFiniteNumber(row.accuracyPct, 0) / 100);
  const riskControl = clamp01(toFiniteNumber(row.riskControlPct, 0) / 100);
  const discipline = clamp01(toFiniteNumber(row.disciplinePct, 0) / 100);
  const transparency = clamp01(toFiniteNumber(row.transparencyPct, 0) / 100);

  const score = accuracy * 0.4 + riskControl * 0.25 + discipline * 0.2 + transparency * 0.15;
  return clamp(0, score * 100, 100);
}

function defaultReportV1(): JiguBaoModuleReportV1 {
  return {
    generatedAt: nowIso(),
    totalEquity: 0,
    coveragePct: 0,
    symbols: [],
    stats: {
      symbolCount: 0,
      undervaluedCount: 0,
      neutralCount: 0,
      overvaluedCount: 0,
      valueTrapCount: 0,
    },
    notes: ["统一输入为空，基估宝模块等待数据接入。"],
  };
}

export function buildJiguBaoModuleReportV1(request: DaaUnifiedRequestV1 | null | undefined): JiguBaoModuleReportV1 {
  if (!request) return defaultReportV1();

  const targetWeights = normalizeTargetWeights(request.targetWeights);

  const positions = Array.isArray(request.positions) ? request.positions : [];
  const positionBySymbol = new Map<
    string,
    {
      notional: number;
      market: string;
      tags: string[];
    }
  >();

  let holdingsNotional = 0;
  for (const position of positions) {
    const symbol = normalizeSymbol(position?.symbol);
    if (!symbol) continue;

    const qty = Math.max(0, toFiniteNumber(position?.qty, 0));
    const price = Math.max(0, toFiniteNumber(position?.price, 0));
    const notional = qty * price;
    if (!(notional > 0)) continue;

    const prev = positionBySymbol.get(symbol);
    if (prev) {
      prev.notional += notional;
      prev.tags = Array.from(new Set([...prev.tags, ...normalizeTags(position?.tags)]));
    } else {
      positionBySymbol.set(symbol, {
        notional,
        market: normalizeMarket(position?.market),
        tags: normalizeTags(position?.tags),
      });
    }

    holdingsNotional += notional;
  }

  const cash = Math.max(0, toFiniteNumber(request.account?.cash, 0));
  const totalEquityInput = Math.max(0, toFiniteNumber(request.account?.totalEquity, 0));
  const totalEquity = totalEquityInput > 0 ? totalEquityInput : holdingsNotional + cash;

  const analysts = Array.isArray(request.analysts) ? request.analysts : [];
  const analystScoreById = new Map<string, number>();
  for (const analyst of analysts) {
    const analystId = String(analyst?.analystId ?? "").trim();
    if (!analystId) continue;
    analystScoreById.set(analystId, analystScorePct(analyst));
  }

  const views = Array.isArray(request.assetViews) ? request.assetViews : [];
  const viewsBySymbol = new Map<
    string,
    Array<{ analystId: string; conviction: number; thesisDriftPct: number; momentum: DaaMomentumRegimeV1 }>
  >();

  for (const view of views) {
    const symbol = normalizeSymbol(view?.symbol);
    if (!symbol) continue;

    const analystId = String(view?.analystId ?? "").trim();
    if (!analystId) continue;

    const conviction = clamp01(toFiniteNumber(view?.convictionPct, 0) / 100);
    const thesisDriftPct = clamp(0, toFiniteNumber(view?.thesisDriftPct, 0), 100);

    if (!viewsBySymbol.has(symbol)) viewsBySymbol.set(symbol, []);
    viewsBySymbol.get(symbol)!.push({
      analystId,
      conviction,
      thesisDriftPct,
      momentum: normalizeMomentum(view?.momentumRegime),
    });
  }

  const universe = new Set<string>([
    ...Object.keys(targetWeights),
    ...positionBySymbol.keys(),
    ...viewsBySymbol.keys(),
  ]);

  const rows: JiguBaoSymbolInsightV1[] = [];
  let withCoverage = 0;

  for (const symbol of universe) {
    if (!symbol) continue;

    const position = positionBySymbol.get(symbol);
    const currentWeight = totalEquity > 0 ? (position?.notional ?? 0) / totalEquity : 0;
    const targetWeight = targetWeights[symbol] ?? 0;
    const allocationGap = targetWeight - currentWeight;

    const symbolViews = viewsBySymbol.get(symbol) ?? [];
    if (symbolViews.length > 0) withCoverage += 1;

    let weightSum = 0;
    let scoreSum = 0;
    let thesisDriftSum = 0;
    let momentumSum = 0;

    for (const view of symbolViews) {
      const analystScore = analystScoreById.get(view.analystId) ?? 58;
      const weight = view.conviction > 0 ? view.conviction : 0.2;

      weightSum += weight;
      scoreSum += analystScore * weight;
      thesisDriftSum += view.thesisDriftPct * weight;
      momentumSum += momentumScore(view.momentum) * weight;
    }

    const humanScore = weightSum > 0 ? scoreSum / weightSum : 50;
    const thesisDriftPct = weightSum > 0 ? thesisDriftSum / weightSum : 8;
    const momentumRaw = weightSum > 0 ? momentumSum / weightSum : 0;
    const momentum: DaaMomentumRegimeV1 = momentumRaw > 0.2 ? "strong" : momentumRaw < -0.2 ? "weak" : "neutral";

    const hasSb = hasSbTag(position?.tags ?? []);
    const isValueTrap = hasSb || humanScore < 35 || thesisDriftPct >= 14;

    const valuationScoreRaw =
      50 +
      allocationGap * 140 +
      (humanScore - 60) * 0.32 +
      momentumRaw * 10 -
      Math.max(0, thesisDriftPct - 8) * 1.5;

    const valuationScore = clamp(0, valuationScoreRaw, 100);

    let valuationSignal: JiguBaoValuationSignalV1;
    if (valuationScore >= 66) valuationSignal = "undervalued";
    else if (valuationScore <= 42) valuationSignal = "overvalued";
    else valuationSignal = "neutral";

    if (isValueTrap) valuationSignal = "overvalued";

    let suggestedAction: JiguBaoActionV1 = "hold_watch";
    if (isValueTrap) {
      suggestedAction = "isolate_exit";
    } else if (valuationSignal === "undervalued" && allocationGap > 0.02) {
      suggestedAction = "buy_on_dips";
    } else if (valuationSignal === "overvalued" && allocationGap < -0.02) {
      suggestedAction = "trim_rebalance";
    }

    const suggestedNotional =
      suggestedAction === "buy_on_dips" || suggestedAction === "trim_rebalance"
        ? Math.max(0, Math.abs(allocationGap) * totalEquity)
        : 0;

    const confidenceBase = 0.35 + Math.min(1, symbolViews.length / 2) * 0.5 + Math.min(0.15, Math.abs(allocationGap) * 1.5);
    const confidencePct = clamp(20, confidenceBase * 100, 99);

    rows.push({
      symbol,
      market: position?.market ?? "UNKNOWN",
      currentWeightPct: currentWeight * 100,
      targetWeightPct: targetWeight * 100,
      allocationGapPct: allocationGap * 100,
      valuationScore,
      valuationSignal,
      humanScorePct: humanScore,
      thesisDriftPct,
      momentum,
      isValueTrap,
      suggestedAction,
      suggestedNotional,
      confidencePct,
    });
  }

  rows.sort((a, b) => {
    if (a.isValueTrap !== b.isValueTrap) return a.isValueTrap ? -1 : 1;
    const scoreA = Math.abs(a.allocationGapPct) + Math.abs(a.valuationScore - 50) * 0.2;
    const scoreB = Math.abs(b.allocationGapPct) + Math.abs(b.valuationScore - 50) * 0.2;
    return scoreB - scoreA;
  });

  const stats = {
    symbolCount: rows.length,
    undervaluedCount: rows.filter((row) => row.valuationSignal === "undervalued").length,
    neutralCount: rows.filter((row) => row.valuationSignal === "neutral").length,
    overvaluedCount: rows.filter((row) => row.valuationSignal === "overvalued").length,
    valueTrapCount: rows.filter((row) => row.isValueTrap).length,
  };

  const notes: string[] = [];
  if (!rows.length) {
    notes.push("统一输入里还没有可计算的标的。请先执行“旧结构适配”或手动粘贴输入。");
  }
  if (stats.valueTrapCount > 0) {
    notes.push(`发现 ${stats.valueTrapCount} 个价值陷阱候选，建议切换到“仅卖出/强制清仓”策略。`);
  }
  if (rows.length > 0 && withCoverage === 0) {
    notes.push("当前没有人因覆盖数据，估值评分已回落到中性基线。建议先同步情报源。");
  }

  return {
    generatedAt: nowIso(),
    totalEquity,
    coveragePct: rows.length > 0 ? (withCoverage / rows.length) * 100 : 0,
    symbols: rows,
    stats,
    notes,
  };
}
