import { rebalanceCore, type SuggestedOrder } from "@/src/core/rebalanceCore";
import { isPlainObject } from "@/src/daa/engineContracts";
import {
  buildDaaAssetKeyV1,
  normalizeDaaCurrencyCodeV1,
  normalizeDaaMarketV1,
  parseDaaAssetKeyV1,
} from "@/src/daa/assetKeyV1";

export type DaaRiskTierV1 = "low" | "mid" | "high";
export type DaaMomentumRegimeV1 = "strong" | "neutral" | "weak";
export type DaaAnalystStanceV1 = "offensive" | "neutral" | "defensive";

export type DaaUnifiedPositionV1 = {
  symbol: string;
  market?: string;
  currency?: string;
  qty: number;
  price: number;
  /** 兼容旧字段：单价口径的成本价（本币） */
  costBasis?: number;
  /** 推荐字段：单价口径的成本价（本币） */
  costBasisPerUnit?: number;
  tags?: string[];
};

export type DaaUnifiedCandidateAssetV1 = {
  symbol: string;
  market?: string;
  currency?: string;
  targetWeightHint?: number;
  enabled?: boolean;
  tags?: string[];
  notes?: string;
};

export type DaaUnifiedFxRateV1 = {
  baseCcy: string;
  quoteCcy: string;
  rate: number;
  source?: string;
  asOfTs?: string;
};

export type DaaUnifiedAnalystV1 = {
  analystId: string;
  accuracyPct: number;
  riskControlPct: number;
  disciplinePct: number;
  transparencyPct: number;
  stance?: DaaAnalystStanceV1;
  styleCluster?: string;
};

export type DaaUnifiedAssetViewV1 = {
  symbol: string;
  analystId: string;
  convictionPct: number;
  thesisDriftPct: number;
  momentumRegime?: DaaMomentumRegimeV1;
};

export type DaaUnifiedHumanSignalV1 = {
  symbol: string;
  aggregatedScorePct: number;
  convictionPct: number;
  thesisDriftPct: number;
  confidencePct?: number;
  momentumRegime?: DaaMomentumRegimeV1;
  stance?: DaaAnalystStanceV1;
  riskTags?: string[];
  sourceRefs?: string[];
};

export type DaaUnifiedRequestV1 = {
  account?: {
    baseCurrency?: string;
    cash?: number;
    investableCash?: number;
    frozenCash?: number;
    totalEquity?: number;
    equityPeak?: number;
  };
  constraints?: {
    maxPositionPct?: number;
    minNotional?: number;
    maxOrderPctOfNav?: number;
  };
  policy?: {
    baseDriftTriggerPct?: number;
    strongTrendDriftTriggerPct?: number;
    riskOffConsensusPct?: number;
    riskOffScalePct?: number;
    valueTrapThesisDriftPct?: number;
    sbIsolationScorePct?: number;
  };
  risk?: {
    maxDrawdownPct?: number;
    perAssetStopLossPct?: number;
    maxConcentrationPct?: number;
    correlationCapPct?: number;
    maxTotalRiskExposurePct?: number;
  };
  targetWeights: Record<string, number>;
  positions: DaaUnifiedPositionV1[];
  candidateAssets?: DaaUnifiedCandidateAssetV1[];
  fxRates?: DaaUnifiedFxRateV1[];
  analysts?: DaaUnifiedAnalystV1[];
  assetViews?: DaaUnifiedAssetViewV1[];
  humanSignals?: DaaUnifiedHumanSignalV1[];
};

export type DaaHumanFactorDecisionV1 = {
  symbol: string;
  weightedScorePct: number;
  weightedDriftPct: number;
  tier: "elite" | "steady" | "watch" | "isolated";
  momentumRegime: DaaMomentumRegimeV1;
  multiplier: number;
  reasons: string[];
};

export type DaaExecutableOrderV1 = SuggestedOrder & {
  assetKey: string;
  market: string;
  instrumentCurrency: string;
  qty?: number;
  price?: number;
  cappedBy: string[];
};

export type DaaBlockedOrderV1 = SuggestedOrder & {
  assetKey: string;
  market: string;
  instrumentCurrency: string;
  qty?: number;
  price?: number;
  blockedBy: string;
};

export type DaaUnifiedResponseV1 = {
  ok: true;
  generatedAt: string;
  summary: {
    baseCurrency: string;
    totalEquity: number;
    triggerThresholdPct: number;
    shouldRebalance: boolean;
    executableOrderCount: number;
    blockedOrderCount: number;
  };
  layers: {
    sensory: {
      fxCoveragePct: number;
      fxFreshCoveragePct: number;
      crossMarketExposure: Record<string, number>;
    };
    strategy: {
      adjustedTargetWeights: Record<string, number>;
      riskTierBudget: Record<DaaRiskTierV1, number>;
    };
    humanFactor: {
      assetDecisions: DaaHumanFactorDecisionV1[];
      defensiveConsensusPct: number;
      duplicatedStyleClusters: string[];
    };
    guardrail: {
      maxOrderPctOfNav: number;
      isolatedSymbols: string[];
      riskOffReason: string | null;
      concentrationWarnings: string[];
    };
  };
  executableOrders: DaaExecutableOrderV1[];
  blockedOrders: DaaBlockedOrderV1[];
  warnings: string[];
};

function toFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function normalizeSymbol(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const raw of tags) {
    const t = String(raw ?? "").trim().toLowerCase();
    if (t) out.add(t);
  }
  return [...out];
}

function analystScorePct(a: DaaUnifiedAnalystV1): number {
  const accuracy = clamp01(toFiniteNumber(a.accuracyPct, 0) / 100);
  const riskControl = clamp01(toFiniteNumber(a.riskControlPct, 0) / 100);
  const discipline = clamp01(toFiniteNumber(a.disciplinePct, 0) / 100);
  const transparency = clamp01(toFiniteNumber(a.transparencyPct, 0) / 100);

  const score = accuracy * 0.4 + riskControl * 0.25 + discipline * 0.2 + transparency * 0.15;
  return score * 100;
}

function normalizeStance(v: unknown): DaaAnalystStanceV1 {
  if (v === "offensive") return "offensive";
  if (v === "defensive") return "defensive";
  return "neutral";
}

function normalizeMomentum(v: unknown): DaaMomentumRegimeV1 {
  if (v === "strong") return "strong";
  if (v === "weak") return "weak";
  return "neutral";
}

function normalizeRiskTierFromTags(tags: string[]): DaaRiskTierV1 {
  if (tags.includes("low") || tags.includes("low-risk") || tags.includes("bond") || tags.includes("cash")) return "low";
  if (tags.includes("high") || tags.includes("high-risk") || tags.includes("growth") || tags.includes("crypto")) return "high";
  return "mid";
}

function normalizeTargetWeights(weights: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const [symbolRaw, valueRaw] of Object.entries(weights ?? {})) {
    const symbol = normalizeSymbol(symbolRaw);
    if (!symbol) continue;
    const value = clamp01(toFiniteNumber(valueRaw, 0));
    if (value <= 0) continue;
    out[symbol] = value;
    sum += value;
  }

  if (sum <= 1.000001) return out;

  const scaled: Record<string, number> = {};
  for (const [symbol, value] of Object.entries(out)) {
    scaled[symbol] = value / sum;
  }
  return scaled;
}

function normalizeCcyCode(v: unknown, fallback = "USD"): string {
  return normalizeDaaCurrencyCodeV1(v, fallback);
}

function normalizeFxPair(base: string, quote: string): string {
  return `${normalizeCcyCode(base)}/${normalizeCcyCode(quote)}`;
}

type FxLookupValueV1 = {
  rate: number;
  asOfMs: number | null;
};

function toIsoMs(v: unknown): number | null {
  const text = String(v ?? "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function buildFxLookup(fxRates: DaaUnifiedFxRateV1[]): Map<string, FxLookupValueV1> {
  const map = new Map<string, FxLookupValueV1>();
  for (const row of fxRates) {
    const base = normalizeCcyCode(row.baseCcy);
    const quote = normalizeCcyCode(row.quoteCcy);
    const rate = Math.max(0, toFiniteNumber(row.rate, 0));
    if (!base || !quote || rate <= 0) continue;
    const key = normalizeFxPair(base, quote);
    const asOfMs = toIsoMs(row.asOfTs);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { rate, asOfMs });
      continue;
    }
    const prevMs = prev.asOfMs ?? Number.NEGATIVE_INFINITY;
    const nextMs = asOfMs ?? Number.NEGATIVE_INFINITY;
    if (nextMs >= prevMs) {
      map.set(key, { rate, asOfMs });
    }
  }
  return map;
}

function resolveLocalToBaseRate(
  fxMap: Map<string, FxLookupValueV1>,
  localCcy: string,
  baseCcy: string,
): { rate: number; asOfMs: number | null } | null {
  const local = normalizeCcyCode(localCcy, baseCcy);
  const base = normalizeCcyCode(baseCcy, "USD");
  if (local === base) return { rate: 1, asOfMs: Date.now() };

  const direct = fxMap.get(normalizeFxPair(local, base));
  if (direct && Number.isFinite(direct.rate) && direct.rate > 0) return direct;

  const reverse = fxMap.get(normalizeFxPair(base, local));
  if (reverse && Number.isFinite(reverse.rate) && reverse.rate > 0) {
    return { rate: 1 / reverse.rate, asOfMs: reverse.asOfMs ?? null };
  }

  return null;
}

function collectCrossMarketExposure(positions: DaaUnifiedPositionV1[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of positions) {
    const market = String(p.market ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
    const notional = Math.max(0, toFiniteNumber(p.qty, 0)) * Math.max(0, toFiniteNumber(p.price, 0));
    if (notional <= 0) continue;
    out[market] = (out[market] ?? 0) + notional;
  }
  return out;
}

type DaaAssetMetaV1 = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  tags: string[];
};

function normalizeAssetKeyTargetWeights(targetWeights: Record<string, number>): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [rawKey, rawWeight] of Object.entries(targetWeights ?? {})) {
    const keyText = String(rawKey ?? "").trim().toUpperCase();
    if (!keyText) {
      throw new Error("targetWeights key must not be empty");
    }

    const weight = Number(rawWeight);
    if (!Number.isFinite(weight)) {
      throw new Error(`targetWeights[${keyText}] must be a finite number`);
    }
    if (weight < 0) {
      throw new Error(`targetWeights[${keyText}] must be non-negative`);
    }
    if (weight === 0) continue;

    const parsed = parseDaaAssetKeyV1(keyText);
    if (!parsed) {
      throw new Error(`targetWeights key ${keyText} is invalid, expected MARKET::SYMBOL`);
    }
    const assetKey = buildDaaAssetKeyV1(parsed.symbol, parsed.market);
    if (!assetKey) {
      throw new Error(`targetWeights key ${keyText} cannot be normalized`);
    }

    normalized[assetKey] = (normalized[assetKey] ?? 0) + weight;
  }

  return normalizeTargetWeights(normalized);
}

function buildSymbolTargetWeightMap(targetWeights: Record<string, number>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [rawKey, weight] of Object.entries(normalizeAssetKeyTargetWeights(targetWeights))) {
    const parsed = parseDaaAssetKeyV1(rawKey);
    if (!parsed) {
      throw new Error(`targetWeights key ${rawKey} is invalid, expected MARKET::SYMBOL`);
    }
    const symbol = parsed.symbol;
    map[symbol] = (map[symbol] ?? 0) + weight;
  }
  return normalizeTargetWeights(map);
}

export function isDaaUnifiedRequestV1(x: unknown): x is DaaUnifiedRequestV1 {
  if (!isPlainObject(x)) return false;
  if (!isPlainObject(x.targetWeights)) return false;
  if (!Array.isArray(x.positions)) return false;
  if (x.candidateAssets !== undefined && !Array.isArray(x.candidateAssets)) return false;
  if (x.fxRates !== undefined && !Array.isArray(x.fxRates)) return false;
  if (x.analysts !== undefined && !Array.isArray(x.analysts)) return false;
  if (x.assetViews !== undefined && !Array.isArray(x.assetViews)) return false;
  if (x.humanSignals !== undefined && !Array.isArray(x.humanSignals)) return false;
  const targetWeights = x.targetWeights as Record<string, unknown>;
  for (const [rawKey, rawWeight] of Object.entries(targetWeights)) {
    const keyText = String(rawKey ?? "").trim().toUpperCase();
    if (!keyText) return false;
    if (!parseDaaAssetKeyV1(keyText)) return false;
    const weight = Number(rawWeight);
    if (!Number.isFinite(weight) || weight < 0) return false;
  }
  return true;
}

export function buildDaaUnifiedPlanV1(req: DaaUnifiedRequestV1): DaaUnifiedResponseV1 {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];
  const baseCurrency = normalizeCcyCode(req.account?.baseCurrency, "USD");

  const fxMap = buildFxLookup(req.fxRates ?? []);

  const baseDriftTriggerPct = clamp01(toFiniteNumber(req.policy?.baseDriftTriggerPct, 0.05));
  const strongTrendDriftTriggerPct = clamp01(toFiniteNumber(req.policy?.strongTrendDriftTriggerPct, 0.1));
  const riskOffConsensusPct = clamp01(toFiniteNumber(req.policy?.riskOffConsensusPct, 0.6));
  const riskOffScalePct = clamp01(toFiniteNumber(req.policy?.riskOffScalePct, 0.7));
  const valueTrapThesisDriftPct = clamp01(toFiniteNumber(req.policy?.valueTrapThesisDriftPct, 0.12));
  const sbIsolationScorePct = clamp01(toFiniteNumber(req.policy?.sbIsolationScorePct, 0.35));

  const maxOrderPctOfNav = clamp01(toFiniteNumber(req.constraints?.maxOrderPctOfNav, 0.1));
  const minNotional = Math.max(1, toFiniteNumber(req.constraints?.minNotional, 200));
  const fxMaxAgeHours = 48;
  const fxMaxAgeMs = fxMaxAgeHours * 3600000;

  let fxResolvedCount = 0;
  let fxNeededCount = 0;
  let fxFreshCount = 0;

  const positions = (req.positions ?? []).map((p) => {
    const symbol = normalizeSymbol(p.symbol);
    const market = normalizeDaaMarketV1(p.market, "US");
    const currency = normalizeCcyCode(p.currency, baseCurrency);
    const localPrice = Math.max(0, toFiniteNumber(p.price, 0));
    const localCostBasis = Math.max(0, toFiniteNumber(p.costBasisPerUnit ?? p.costBasis, 0));
    const fxResolved = resolveLocalToBaseRate(fxMap, currency, baseCurrency);
    const fxRate = fxResolved?.rate ?? null;
    const priceInBase = fxRate != null ? localPrice * fxRate : 0;
    const costBasisInBase = fxRate != null ? localCostBasis * fxRate : (currency === baseCurrency ? localCostBasis : 0);

    if (currency !== baseCurrency && localPrice > 0) {
      fxNeededCount += 1;
      if (fxRate != null) {
        fxResolvedCount += 1;
        const fxAgeMs = fxResolved?.asOfMs == null ? Number.POSITIVE_INFINITY : Math.max(0, Date.now() - fxResolved.asOfMs);
        if (fxAgeMs <= fxMaxAgeMs) {
          fxFreshCount += 1;
        } else {
          warnings.push(`symbol ${symbol} FX 汇率超过 ${fxMaxAgeHours} 小时未更新，已标记为过期`);
        }
      } else {
        warnings.push(`symbol ${symbol} 缺少 ${currency}->${baseCurrency} 汇率，已忽略估值`);
      }
    }

    if (currency !== baseCurrency && localCostBasis > 0 && fxRate == null) {
      warnings.push(`symbol ${symbol} 缺少 ${currency}->${baseCurrency} 汇率，成本价无法换算`);
    }

    return {
      assetKey: buildDaaAssetKeyV1(symbol, market),
      symbol,
      market,
      currency,
      qty: Math.max(0, toFiniteNumber(p.qty, 0)),
      price: Math.max(0, priceInBase),
      costBasis: Math.max(0, costBasisInBase),
      tags: normalizeTags(p.tags),
    };
  });

  const holdings: Record<string, number> = {};
  const prices: Record<string, number> = {};
  const positionByAssetKey = new Map<string, (typeof positions)[number]>();
  const assetMetaByKey = new Map<string, DaaAssetMetaV1>();
  const assetKeysBySymbol = new Map<string, string[]>();
  const riskTierBySymbol = new Map<string, DaaRiskTierV1>();
  const riskTierBudget: Record<DaaRiskTierV1, number> = { low: 0, mid: 0, high: 0 };

  const appendAssetMeta = (meta: DaaAssetMetaV1) => {
    if (!meta.assetKey) return;
    const existing = assetMetaByKey.get(meta.assetKey);
    if (!existing) {
      assetMetaByKey.set(meta.assetKey, meta);
    } else if ((existing.tags?.length ?? 0) <= 0 && (meta.tags?.length ?? 0) > 0) {
      assetMetaByKey.set(meta.assetKey, { ...existing, tags: meta.tags });
    }
    const list = assetKeysBySymbol.get(meta.symbol) ?? [];
    if (!list.includes(meta.assetKey)) {
      list.push(meta.assetKey);
      assetKeysBySymbol.set(meta.symbol, list);
    }
  };

  for (const p of positions) {
    if (!p.symbol || !p.assetKey) continue;
    appendAssetMeta({
      assetKey: p.assetKey,
      symbol: p.symbol,
      market: p.market,
      currency: p.currency,
      tags: p.tags,
    });
    if (p.price <= 0) {
      warnings.push(`symbol ${p.symbol} 缺少有效价格，已忽略持仓估值`);
      continue;
    }
    holdings[p.assetKey] = (holdings[p.assetKey] ?? 0) + p.qty;
    prices[p.assetKey] = p.price;
    positionByAssetKey.set(p.assetKey, p);

    const notional = p.qty * p.price;
    const tier = normalizeRiskTierFromTags(p.tags);
    riskTierBudget[tier] += notional;
    const existedTier = riskTierBySymbol.get(p.symbol);
    if (!existedTier) {
      riskTierBySymbol.set(p.symbol, tier);
    } else {
      const rank = { low: 0, mid: 1, high: 2 } as const;
      if (rank[tier] > rank[existedTier]) riskTierBySymbol.set(p.symbol, tier);
    }
  }

  for (const raw of req.candidateAssets ?? []) {
    if (raw.enabled === false) continue;
    const symbol = normalizeSymbol(raw.symbol);
    if (!symbol) continue;
    const market = normalizeDaaMarketV1(raw.market, "US");
    const assetKey = buildDaaAssetKeyV1(symbol, market);
    if (!assetKey) continue;
    appendAssetMeta({
      assetKey,
      symbol,
      market,
      currency: normalizeCcyCode(raw.currency, baseCurrency),
      tags: normalizeTags(raw.tags),
    });
  }

  const inputTargetWeightsByAssetKey = normalizeAssetKeyTargetWeights(req.targetWeights ?? {});
  for (const assetKey of Object.keys(inputTargetWeightsByAssetKey)) {
    if (assetMetaByKey.has(assetKey)) continue;
    const parsedAssetKey = parseDaaAssetKeyV1(assetKey);
    if (!parsedAssetKey) continue;
    appendAssetMeta({
      assetKey,
      symbol: parsedAssetKey.symbol,
      market: parsedAssetKey.market,
      currency: baseCurrency,
      tags: [],
    });
  }
  const targetWeights = buildSymbolTargetWeightMap(inputTargetWeightsByAssetKey);

  const fxCoveragePct = fxNeededCount > 0 ? fxResolvedCount / fxNeededCount : 1;
  const fxFreshCoveragePct = fxNeededCount > 0 ? fxFreshCount / fxNeededCount : 1;
  if (fxCoveragePct < 1) {
    warnings.push(`跨币种估值覆盖率 ${(fxCoveragePct * 100).toFixed(1)}%，请补充 FX 汇率`);
  }
  if (fxFreshCoveragePct < 1) {
    warnings.push(`跨币种汇率时效覆盖率 ${(fxFreshCoveragePct * 100).toFixed(1)}%，已启用开仓保护`);
  }

  const cash = Math.max(0, toFiniteNumber(req.account?.cash, 0));
  const frozenCash = Math.max(0, toFiniteNumber(req.account?.frozenCash, 0));
  const investableRaw = toFiniteNumber(req.account?.investableCash, Number.NaN);
  const investableCashInput = Number.isFinite(investableRaw)
    ? ((investableRaw <= 0 && cash > 0 && frozenCash < cash) ? (cash - frozenCash) : investableRaw)
    : (cash - frozenCash);
  const investableCash = Math.max(0, Math.min(cash, investableCashInput));
  if (investableCash < cash) {
    warnings.push(`检测到冻结/不可投资现金 ${(cash - investableCash).toFixed(2)} ${baseCurrency}`);
  }

  const impliedEquity = Object.entries(holdings).reduce((sum, [symbol, qty]) => sum + qty * (prices[symbol] ?? 0), 0) + cash;
  const totalEquity = Math.max(0, toFiniteNumber(req.account?.totalEquity, impliedEquity));
  const equityPeak = Math.max(totalEquity, toFiniteNumber(req.account?.equityPeak, totalEquity));

  const signalAnalysts: DaaUnifiedAnalystV1[] = [];
  const signalViews: DaaUnifiedAssetViewV1[] = [];
  for (const raw of req.humanSignals ?? []) {
    const symbol = normalizeSymbol(raw.symbol);
    if (!symbol) continue;

    const aggregatedScorePct = clamp01(toFiniteNumber(raw.aggregatedScorePct, 50) / 100) * 100;
    const convictionPct = clamp01(toFiniteNumber(raw.convictionPct, 50) / 100) * 100;
    const thesisDriftPct = clamp01(toFiniteNumber(raw.thesisDriftPct, 0) / 100) * 100;
    const confidencePct = clamp01(toFiniteNumber(raw.confidencePct, 75) / 100) * 100;
    const analystId = `hf_auto__${symbol}`;

    signalAnalysts.push({
      analystId,
      accuracyPct: aggregatedScorePct,
      riskControlPct: (aggregatedScorePct * 0.7 + confidencePct * 0.3),
      disciplinePct: (aggregatedScorePct * 0.65 + confidencePct * 0.35),
      transparencyPct: confidencePct,
      stance: normalizeStance(raw.stance),
      styleCluster: "official-first",
    });

    signalViews.push({
      symbol,
      analystId,
      convictionPct,
      thesisDriftPct,
      momentumRegime: normalizeMomentum(raw.momentumRegime),
    });

    if (confidencePct < 45) {
      warnings.push(`symbol ${symbol} 人因信号置信度偏低（${confidencePct.toFixed(1)}%）`);
    }
    if ((raw.riskTags ?? []).includes("thesis_drift")) {
      warnings.push(`symbol ${symbol} 人因层提示论点漂移`);
    }
  }

  if (signalAnalysts.length > 0 && (req.analysts?.length ?? 0) > 0) {
    warnings.push("检测到外部人因信号与手工分析师观点并行输入，系统已进行合并计算");
  }

  const effectiveAnalysts = [...(req.analysts ?? []), ...signalAnalysts];
  const effectiveAssetViews = [...(req.assetViews ?? []), ...signalViews];

  const analystMap = new Map<string, { scorePct: number; stance: DaaAnalystStanceV1; styleCluster: string }>();
  const styleClusterCount = new Map<string, number>();
  let defensiveCount = 0;
  for (const a of effectiveAnalysts) {
    const analystId = String(a.analystId ?? "").trim();
    if (!analystId) continue;
    const scorePct = analystScorePct(a);
    const stance = normalizeStance(a.stance);
    const styleCluster = String(a.styleCluster ?? "").trim().toLowerCase();

    if (stance === "defensive") defensiveCount += 1;
    if (styleCluster) styleClusterCount.set(styleCluster, (styleClusterCount.get(styleCluster) ?? 0) + 1);

    analystMap.set(analystId, {
      scorePct,
      stance,
      styleCluster,
    });
  }

  const defensiveConsensusPct = effectiveAnalysts.length > 0 ? defensiveCount / effectiveAnalysts.length : 0;
  const duplicatedStyleClusters = [...styleClusterCount.entries()]
    .filter(([, count]) => count >= 2)
    .map(([cluster]) => cluster)
    .sort();

  const viewsBySymbol = new Map<string, DaaUnifiedAssetViewV1[]>();
  for (const raw of effectiveAssetViews) {
    const symbol = normalizeSymbol(raw.symbol);
    const analystId = String(raw.analystId ?? "").trim();
    if (!symbol || !analystId) continue;
    const view: DaaUnifiedAssetViewV1 = {
      symbol,
      analystId,
      convictionPct: clamp01(toFiniteNumber(raw.convictionPct, 0) / 100) * 100,
      thesisDriftPct: clamp01(toFiniteNumber(raw.thesisDriftPct, 0) / 100) * 100,
      momentumRegime: normalizeMomentum(raw.momentumRegime),
    };
    if (!viewsBySymbol.has(symbol)) viewsBySymbol.set(symbol, []);
    viewsBySymbol.get(symbol)!.push(view);
  }

  const assetDecisions: DaaHumanFactorDecisionV1[] = [];
  const isolatedSymbols = new Set<string>();
  const sbIsolatedAssetKeys = new Set<string>();
  const sbIsolatedSymbols = new Set<string>();
  const adjustedWeightRaw: Record<string, number> = {};

  for (const [assetKey, meta] of assetMetaByKey.entries()) {
    if (meta.tags.includes("sb")) sbIsolatedAssetKeys.add(assetKey);
  }
  for (const [symbol, keys] of assetKeysBySymbol.entries()) {
    if (keys.length <= 0) continue;
    const allSb = keys.every((assetKey) => sbIsolatedAssetKeys.has(assetKey));
    if (allSb) sbIsolatedSymbols.add(symbol);
  }

  for (const [symbol, baseWeight] of Object.entries(targetWeights)) {
    const symbolViews = viewsBySymbol.get(symbol) ?? [];

    let convictionSum = 0;
    let weightedScore = 0;
    let weightedDrift = 0;
    let strongMomentum = false;

    for (const view of symbolViews) {
      const analyst = analystMap.get(view.analystId);
      if (!analyst) continue;

      const conviction = clamp01(view.convictionPct / 100);
      convictionSum += conviction;
      weightedScore += analyst.scorePct * conviction;
      weightedDrift += (view.thesisDriftPct / 100) * conviction;
      if (view.momentumRegime === "strong") strongMomentum = true;
    }

    const scorePct = convictionSum > 0 ? weightedScore / convictionSum : 50;
    const driftPct = convictionSum > 0 ? weightedDrift / convictionSum : 0;

    let tier: DaaHumanFactorDecisionV1["tier"] = "steady";
    if (scorePct >= 80) tier = "elite";
    else if (scorePct >= 60) tier = "steady";
    else if (scorePct >= 40) tier = "watch";
    else tier = "isolated";

    const reasons: string[] = [];
    if (sbIsolatedSymbols.has(symbol)) {
      tier = "isolated";
      reasons.push("Tag 命中 sb 隔离舱");
    }

    if (scorePct / 100 < sbIsolationScorePct) {
      tier = "isolated";
      reasons.push("人因评分低于隔离阈值");
    }

    if (driftPct >= valueTrapThesisDriftPct) {
      tier = "isolated";
      reasons.push("论点漂移触发价值陷阱");
    }

    let multiplier = 1;
    if (tier === "elite") multiplier = strongMomentum ? 1.2 : 1.05;
    if (tier === "watch") multiplier = 0.65;
    if (tier === "isolated") multiplier = 0;

    const momentumRegime: DaaMomentumRegimeV1 = strongMomentum ? "strong" : "neutral";

    if (tier === "isolated") isolatedSymbols.add(symbol);

    assetDecisions.push({
      symbol,
      weightedScorePct: Number(scorePct.toFixed(2)),
      weightedDriftPct: Number((driftPct * 100).toFixed(2)),
      tier,
      momentumRegime,
      multiplier,
      reasons,
    });

    adjustedWeightRaw[symbol] = baseWeight * multiplier;
  }

  if (defensiveConsensusPct >= riskOffConsensusPct) {
    warnings.push("触发跨市场防守共识，系统自动整体降仓");
    for (const [symbol, value] of Object.entries(adjustedWeightRaw)) {
      const tier = riskTierBySymbol.get(symbol) ?? "mid";
      if (tier === "low") continue;
      adjustedWeightRaw[symbol] = value * riskOffScalePct;
    }
  }

  const adjustedTargetWeights = normalizeTargetWeights(adjustedWeightRaw);
  const adjustedTargetWeightsForCore: Record<string, number> = {};
  for (const [assetKey, assetWeight] of Object.entries(inputTargetWeightsByAssetKey)) {
    if (!(assetWeight > 0)) continue;
    const parsedAssetKey = parseDaaAssetKeyV1(assetKey);
    if (!parsedAssetKey) continue;
    const symbol = parsedAssetKey.symbol;
    const symbolBaseWeight = targetWeights[symbol] ?? 0;
    const symbolAdjustedWeight = adjustedTargetWeights[symbol] ?? 0;
    if (!(symbolBaseWeight > 0) || !(symbolAdjustedWeight > 0)) continue;
    const scaledWeight = assetWeight * (symbolAdjustedWeight / symbolBaseWeight);
    if (!(scaledWeight > 0)) continue;
    adjustedTargetWeightsForCore[assetKey] = (adjustedTargetWeightsForCore[assetKey] ?? 0) + scaledWeight;
  }
  const coreTargetWeights = normalizeTargetWeights(adjustedTargetWeightsForCore);

  const riskMaxDrawdownPct = clamp01(toFiniteNumber(req.risk?.maxDrawdownPct, 0.15));
  const riskStopLossPct = clamp01(toFiniteNumber(req.risk?.perAssetStopLossPct, 0.2));
  const riskMaxConcentrationPct = clamp01(toFiniteNumber(req.risk?.maxConcentrationPct, 0.3));
  const riskCorrelationCapPct = clamp01(toFiniteNumber(req.risk?.correlationCapPct, 0.6));
  const riskTotalExposurePct = clamp01(toFiniteNumber(req.risk?.maxTotalRiskExposurePct, 0.7));

  let riskOffReason: string | null = null;
  const concentrationWarnings: string[] = [];

  const drawdownPct = equityPeak > 0 ? (equityPeak - totalEquity) / equityPeak : 0;
  if (drawdownPct >= riskMaxDrawdownPct) {
    riskOffReason = "max_drawdown";
    warnings.push(`触发最大回撤保护（${(drawdownPct * 100).toFixed(2)}%）`);
  }

  for (const position of positions) {
    if (!(position.costBasis > 0) || !(position.price > 0)) continue;
    const lossPct = (position.costBasis - position.price) / position.costBasis;
    if (lossPct >= riskStopLossPct) {
      warnings.push(`symbol ${position.symbol} 触发止损线（${(lossPct * 100).toFixed(2)}%）`);
    }
  }

  const concentrationPairs = Object.entries(adjustedTargetWeights);
  for (const [symbol, weight] of concentrationPairs) {
    if (weight >= riskMaxConcentrationPct) {
      concentrationWarnings.push(`${symbol} 权重 ${(weight * 100).toFixed(2)}% 超过集中度阈值`);
    }
  }
  warnings.push(...concentrationWarnings);

  const highRiskExposure = positions
    .filter((p) => p.tags.includes("high") || p.tags.includes("high-risk") || p.tags.includes("growth"))
    .reduce((sum, p) => sum + p.qty * p.price, 0);
  const highRiskExposurePct = totalEquity > 0 ? highRiskExposure / totalEquity : 0;
  if (highRiskExposurePct > riskTotalExposurePct) {
    warnings.push(`高风险资产暴露 ${(highRiskExposurePct * 100).toFixed(2)}% 超过阈值`);
  }

  const correlatedExposure = positions
    .filter((p) => p.tags.includes("high-corr") || p.tags.includes("high_corr"))
    .reduce((sum, p) => sum + p.qty * p.price, 0);
  const correlatedExposurePct = totalEquity > 0 ? correlatedExposure / totalEquity : 0;
  if (correlatedExposurePct > riskCorrelationCapPct) {
    warnings.push(`高相关资产暴露 ${(correlatedExposurePct * 100).toFixed(2)}% 超过阈值`);
  }

  const strongTrendExists = assetDecisions.some((item) => item.tier === "elite" && item.momentumRegime === "strong");
  const triggerThresholdPct = strongTrendExists ? strongTrendDriftTriggerPct : baseDriftTriggerPct;

  const core = rebalanceCore({
    account: {
      cash: investableCash,
      totalEquity,
    },
    constraints: {
      maxPositionPct: clamp01(toFiniteNumber(req.constraints?.maxPositionPct, 1)),
      minNotional,
      maxIn: Number.POSITIVE_INFINITY,
      maxOut: Number.POSITIVE_INFINITY,
    },
    policy: {
      thresholdPct: triggerThresholdPct,
      minTradeNotional: minNotional,
    },
    holdings,
    prices,
    targetWeights: coreTargetWeights,
  });

  const executableOrders: DaaExecutableOrderV1[] = [];
  const blockedOrders: DaaBlockedOrderV1[] = [];

  const navCap = totalEquity * maxOrderPctOfNav;
  const blockBuyByFxGuardrail = fxNeededCount > 0 && (fxCoveragePct < 1 || fxFreshCoveragePct < 1);

  for (const order of core.orders) {
    const rawAssetKey = normalizeSymbol(order.assetKey || order.symbol);
    const parsedOrderKey = parseDaaAssetKeyV1(rawAssetKey);
    if (!parsedOrderKey) {
      throw new Error(`order assetKey is invalid: ${rawAssetKey}`);
    }
    const normalizedAssetKey = buildDaaAssetKeyV1(parsedOrderKey.symbol, parsedOrderKey.market);
    if (!normalizedAssetKey) {
      throw new Error(`order assetKey cannot be normalized: ${rawAssetKey}`);
    }
    const resolvedMeta = assetMetaByKey.get(normalizedAssetKey);
    if (!resolvedMeta) {
      throw new Error(`missing asset metadata for order assetKey: ${normalizedAssetKey}`);
    }
    const symbol = resolvedMeta.symbol;
    const normalizedInstrumentCurrency = normalizeCcyCode(order.instrumentCurrency, resolvedMeta.currency);
    const orderPayload = {
      ...order,
      assetKey: resolvedMeta.assetKey,
      symbol,
      market: resolvedMeta.market,
      instrumentCurrency: normalizedInstrumentCurrency,
    };
    const caps: Array<{ label: string; value: number }> = [];
    const position = positionByAssetKey.get(resolvedMeta.assetKey);

    if (Number.isFinite(navCap) && navCap > 0) {
      caps.push({ label: `NAV ${Math.round(maxOrderPctOfNav * 100)}%`, value: navCap });
    }

    let orderNotional = order.notional;
    const cappedBy: string[] = [];

    if (order.side === "BUY" && (isolatedSymbols.has(symbol) || sbIsolatedAssetKeys.has(resolvedMeta.assetKey))) {
      blockedOrders.push({ ...orderPayload, blockedBy: "sb_isolation" });
      continue;
    }
    if (riskOffReason && order.side === "BUY") {
      blockedOrders.push({ ...orderPayload, blockedBy: riskOffReason });
      continue;
    }
    if (order.side === "BUY" && blockBuyByFxGuardrail && normalizeCcyCode(position?.currency, normalizedInstrumentCurrency) !== baseCurrency) {
      blockedOrders.push({ ...orderPayload, blockedBy: "fx_guardrail" });
      continue;
    }

    if (caps.length > 0) {
      const minCap = Math.min(...caps.map((cap) => cap.value).filter((v) => Number.isFinite(v) && v > 0));
      if (Number.isFinite(minCap) && minCap > 0 && orderNotional > minCap) {
        orderNotional = minCap;
        for (const cap of caps) {
          if (cap.value <= minCap + 1e-9) cappedBy.push(cap.label);
        }
      }
    }

    if (orderNotional < minNotional) {
      blockedOrders.push({ ...orderPayload, blockedBy: "below_min_notional_after_caps" });
      continue;
    }

    executableOrders.push({
      ...orderPayload,
      notional: Number(orderNotional.toFixed(2)),
      cappedBy,
    });
  }

  const crossMarketExposure = collectCrossMarketExposure(positions);

  return {
    ok: true,
    generatedAt,
    summary: {
      baseCurrency,
      totalEquity,
      triggerThresholdPct,
      shouldRebalance: core.trigger.shouldRebalance,
      executableOrderCount: executableOrders.length,
      blockedOrderCount: blockedOrders.length,
    },
    layers: {
      sensory: {
        fxCoveragePct: Number((fxCoveragePct * 100).toFixed(2)),
        fxFreshCoveragePct: Number((fxFreshCoveragePct * 100).toFixed(2)),
        crossMarketExposure,
      },
      strategy: {
        adjustedTargetWeights,
        riskTierBudget,
      },
      humanFactor: {
        assetDecisions: assetDecisions.sort((a, b) => a.symbol.localeCompare(b.symbol)),
        defensiveConsensusPct: Number((defensiveConsensusPct * 100).toFixed(2)),
        duplicatedStyleClusters,
      },
      guardrail: {
        maxOrderPctOfNav: Number((maxOrderPctOfNav * 100).toFixed(2)),
        isolatedSymbols: [...isolatedSymbols].sort(),
        riskOffReason,
        concentrationWarnings,
      },
    },
    executableOrders,
    blockedOrders,
    warnings: [...warnings, ...core.warnings],
  };
}

export function buildDaaUnifiedPlanFromUnknownV1(raw: unknown): DaaUnifiedResponseV1 {
  if (!isDaaUnifiedRequestV1(raw)) {
    throw new Error("invalid request shape");
  }
  return buildDaaUnifiedPlanV1(raw);
}

export const DAA_UNIFIED_SAMPLE_REQUEST_V1: DaaUnifiedRequestV1 = {
  account: {
    baseCurrency: "USD",
    cash: 12000,
  },
  constraints: {
    minNotional: 500,
    maxOrderPctOfNav: 0.1,
  },
  policy: {
    baseDriftTriggerPct: 0.05,
    strongTrendDriftTriggerPct: 0.1,
    valueTrapThesisDriftPct: 0.12,
    sbIsolationScorePct: 0.35,
    riskOffConsensusPct: 0.6,
    riskOffScalePct: 0.7,
  },
  risk: {
    maxDrawdownPct: 0.15,
    perAssetStopLossPct: 0.2,
    maxConcentrationPct: 0.3,
    correlationCapPct: 0.6,
    maxTotalRiskExposurePct: 0.7,
  },
  targetWeights: {
    "US::SPY": 0.4,
    "US::QQQ": 0.25,
    "US::BND": 0.2,
    "US::TSLA": 0.15,
  },
  positions: [
    { symbol: "SPY", market: "US", currency: "USD", qty: 40, price: 545, costBasis: 520, tags: ["mid"] },
    { symbol: "QQQ", market: "US", currency: "USD", qty: 22, price: 465, costBasis: 440, tags: ["high"] },
    { symbol: "BND", market: "US", currency: "USD", qty: 35, price: 73, costBasis: 75, tags: ["low", "bond"] },
    { symbol: "TSLA", market: "US", currency: "USD", qty: 12, price: 235, costBasis: 290, tags: ["high", "high_corr"] },
  ],
  fxRates: [
    { baseCcy: "USD", quoteCcy: "USD", rate: 1, source: "sample", asOfTs: "2026-03-01T00:00:00.000Z" },
    { baseCcy: "USD", quoteCcy: "CNY", rate: 7.2, source: "sample", asOfTs: "2026-03-01T00:00:00.000Z" },
    { baseCcy: "USD", quoteCcy: "HKD", rate: 7.8, source: "sample", asOfTs: "2026-03-01T00:00:00.000Z" },
  ],
  analysts: [
    {
      analystId: "alpha_lab",
      accuracyPct: 82,
      riskControlPct: 80,
      disciplinePct: 88,
      transparencyPct: 76,
      stance: "offensive",
      styleCluster: "trend",
    },
    {
      analystId: "macro_guard",
      accuracyPct: 75,
      riskControlPct: 92,
      disciplinePct: 84,
      transparencyPct: 80,
      stance: "defensive",
      styleCluster: "macro",
    },
  ],
  assetViews: [
    { symbol: "SPY", analystId: "alpha_lab", convictionPct: 78, thesisDriftPct: 4, momentumRegime: "strong" },
    { symbol: "QQQ", analystId: "alpha_lab", convictionPct: 70, thesisDriftPct: 7, momentumRegime: "strong" },
    { symbol: "BND", analystId: "macro_guard", convictionPct: 66, thesisDriftPct: 2, momentumRegime: "neutral" },
    { symbol: "TSLA", analystId: "alpha_lab", convictionPct: 55, thesisDriftPct: 11, momentumRegime: "neutral" },
  ],
};
