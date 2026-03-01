import { rebalanceCore, type SuggestedOrder } from "@/src/core/rebalanceCore";
import { isPlainObject } from "@/src/daa/engineContracts";

export type DaaRiskTierV1 = "low" | "mid" | "high";
export type DaaMomentumRegimeV1 = "strong" | "neutral" | "weak";
export type DaaAnalystStanceV1 = "offensive" | "neutral" | "defensive";

export type DaaUnifiedPositionV1 = {
  symbol: string;
  market?: string;
  currency?: string;
  qty: number;
  price: number;
  tags?: string[];
  liquidityNotional24h?: number;
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
    cash?: number;
    totalEquity?: number;
  };
  constraints?: {
    maxPositionPct?: number;
    minNotional?: number;
    maxOrderPctOfNav?: number;
    maxOrderPctOfLiquidity?: number;
  };
  policy?: {
    baseDriftTriggerPct?: number;
    strongTrendDriftTriggerPct?: number;
    riskOffConsensusPct?: number;
    riskOffScalePct?: number;
    valueTrapThesisDriftPct?: number;
    sbIsolationScorePct?: number;
  };
  targetWeights: Record<string, number>;
  positions: DaaUnifiedPositionV1[];
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
  cappedBy: string[];
};

export type DaaBlockedOrderV1 = SuggestedOrder & {
  blockedBy: string;
};

export type DaaUnifiedResponseV1 = {
  ok: true;
  generatedAt: string;
  summary: {
    totalEquity: number;
    triggerThresholdPct: number;
    shouldRebalance: boolean;
    executableOrderCount: number;
    blockedOrderCount: number;
  };
  layers: {
    sensory: {
      crossMarketExposure: Record<string, number>;
      liquidityCoveragePct: number;
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
      maxOrderPctOfLiquidity: number;
      isolatedSymbols: string[];
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

export function isDaaUnifiedRequestV1(x: unknown): x is DaaUnifiedRequestV1 {
  if (!isPlainObject(x)) return false;
  if (!isPlainObject(x.targetWeights)) return false;
  if (!Array.isArray(x.positions)) return false;
  if (x.analysts !== undefined && !Array.isArray(x.analysts)) return false;
  if (x.assetViews !== undefined && !Array.isArray(x.assetViews)) return false;
  if (x.humanSignals !== undefined && !Array.isArray(x.humanSignals)) return false;
  return true;
}

export function buildDaaUnifiedPlanV1(req: DaaUnifiedRequestV1): DaaUnifiedResponseV1 {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  const baseDriftTriggerPct = clamp01(toFiniteNumber(req.policy?.baseDriftTriggerPct, 0.05));
  const strongTrendDriftTriggerPct = clamp01(toFiniteNumber(req.policy?.strongTrendDriftTriggerPct, 0.1));
  const riskOffConsensusPct = clamp01(toFiniteNumber(req.policy?.riskOffConsensusPct, 0.6));
  const riskOffScalePct = clamp01(toFiniteNumber(req.policy?.riskOffScalePct, 0.7));
  const valueTrapThesisDriftPct = clamp01(toFiniteNumber(req.policy?.valueTrapThesisDriftPct, 0.12));
  const sbIsolationScorePct = clamp01(toFiniteNumber(req.policy?.sbIsolationScorePct, 0.35));

  const maxOrderPctOfNav = clamp01(toFiniteNumber(req.constraints?.maxOrderPctOfNav, 0.1));
  const maxOrderPctOfLiquidity = clamp01(toFiniteNumber(req.constraints?.maxOrderPctOfLiquidity, 0.15));
  const minNotional = Math.max(1, toFiniteNumber(req.constraints?.minNotional, 200));

  const positions = (req.positions ?? []).map((p) => ({
    symbol: normalizeSymbol(p.symbol),
    market: String(p.market ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN",
    currency: String(p.currency ?? "USD").trim().toUpperCase() || "USD",
    qty: Math.max(0, toFiniteNumber(p.qty, 0)),
    price: Math.max(0, toFiniteNumber(p.price, 0)),
    tags: normalizeTags(p.tags),
    liquidityNotional24h: Math.max(0, toFiniteNumber(p.liquidityNotional24h, 0)),
  }));

  const holdings: Record<string, number> = {};
  const prices: Record<string, number> = {};
  const positionBySymbol = new Map<string, (typeof positions)[number]>();
  const riskTierBudget: Record<DaaRiskTierV1, number> = { low: 0, mid: 0, high: 0 };

  for (const p of positions) {
    if (!p.symbol) continue;
    if (p.price <= 0) {
      warnings.push(`symbol ${p.symbol} 缺少有效价格，已忽略持仓估值`);
      continue;
    }
    holdings[p.symbol] = (holdings[p.symbol] ?? 0) + p.qty;
    prices[p.symbol] = p.price;
    positionBySymbol.set(p.symbol, p);

    const notional = p.qty * p.price;
    const tier = normalizeRiskTierFromTags(p.tags);
    riskTierBudget[tier] += notional;
  }

  const cash = Math.max(0, toFiniteNumber(req.account?.cash, 0));
  const impliedEquity = Object.entries(holdings).reduce((sum, [symbol, qty]) => sum + qty * (prices[symbol] ?? 0), 0) + cash;
  const totalEquity = Math.max(0, toFiniteNumber(req.account?.totalEquity, impliedEquity));

  const targetWeights = normalizeTargetWeights(req.targetWeights ?? {});

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
  const adjustedWeightRaw: Record<string, number> = {};

  for (const [symbol, baseWeight] of Object.entries(targetWeights)) {
    const symbolViews = viewsBySymbol.get(symbol) ?? [];
    const positionTags = positionBySymbol.get(symbol)?.tags ?? [];

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
    if (positionTags.includes("sb")) {
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
      const tier = normalizeRiskTierFromTags(positionBySymbol.get(symbol)?.tags ?? []);
      if (tier === "low") continue;
      adjustedWeightRaw[symbol] = value * riskOffScalePct;
    }
  }

  const adjustedTargetWeights = normalizeTargetWeights(adjustedWeightRaw);

  const strongTrendExists = assetDecisions.some((item) => item.tier === "elite" && item.momentumRegime === "strong");
  const triggerThresholdPct = strongTrendExists ? strongTrendDriftTriggerPct : baseDriftTriggerPct;

  const core = rebalanceCore({
    account: {
      cash,
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
    targetWeights: adjustedTargetWeights,
  });

  const executableOrders: DaaExecutableOrderV1[] = [];
  const blockedOrders: DaaBlockedOrderV1[] = [];

  const navCap = totalEquity * maxOrderPctOfNav;

  for (const order of core.orders) {
    const symbol = normalizeSymbol(order.symbol);
    const caps: Array<{ label: string; value: number }> = [];
    const position = positionBySymbol.get(symbol);

    if (Number.isFinite(navCap) && navCap > 0) {
      caps.push({ label: `NAV ${Math.round(maxOrderPctOfNav * 100)}%`, value: navCap });
    }

    const liquidity = Math.max(0, toFiniteNumber(position?.liquidityNotional24h, 0));
    if (liquidity > 0) {
      caps.push({ label: `流动性 ${Math.round(maxOrderPctOfLiquidity * 100)}%`, value: liquidity * maxOrderPctOfLiquidity });
    }

    let orderNotional = order.notional;
    const cappedBy: string[] = [];

    if (order.side === "BUY" && isolatedSymbols.has(symbol)) {
      blockedOrders.push({ ...order, blockedBy: "sb_isolation" });
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
      blockedOrders.push({ ...order, blockedBy: "below_min_notional_after_caps" });
      continue;
    }

    executableOrders.push({
      ...order,
      notional: Number(orderNotional.toFixed(2)),
      cappedBy,
    });
  }

  const crossMarketExposure = collectCrossMarketExposure(positions);
  const liquidityCoveredNotional = positions.reduce((sum, p) => {
    const notional = p.qty * p.price;
    if (p.liquidityNotional24h > 0) return sum + notional;
    return sum;
  }, 0);

  const investedNotional = positions.reduce((sum, p) => sum + p.qty * p.price, 0);
  const liquidityCoveragePct = investedNotional > 0 ? liquidityCoveredNotional / investedNotional : 0;

  return {
    ok: true,
    generatedAt,
    summary: {
      totalEquity,
      triggerThresholdPct,
      shouldRebalance: core.trigger.shouldRebalance,
      executableOrderCount: executableOrders.length,
      blockedOrderCount: blockedOrders.length,
    },
    layers: {
      sensory: {
        crossMarketExposure,
        liquidityCoveragePct: Number((liquidityCoveragePct * 100).toFixed(2)),
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
        maxOrderPctOfLiquidity: Number((maxOrderPctOfLiquidity * 100).toFixed(2)),
        isolatedSymbols: [...isolatedSymbols].sort(),
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
    cash: 12000,
  },
  constraints: {
    minNotional: 500,
    maxOrderPctOfNav: 0.1,
    maxOrderPctOfLiquidity: 0.15,
  },
  policy: {
    baseDriftTriggerPct: 0.05,
    strongTrendDriftTriggerPct: 0.1,
    valueTrapThesisDriftPct: 0.12,
    sbIsolationScorePct: 0.35,
    riskOffConsensusPct: 0.6,
    riskOffScalePct: 0.7,
  },
  targetWeights: {
    SPY: 0.4,
    QQQ: 0.25,
    BND: 0.2,
    TSLA: 0.15,
  },
  positions: [
    { symbol: "SPY", market: "US", currency: "USD", qty: 40, price: 545, liquidityNotional24h: 1200000000, tags: ["mid"] },
    { symbol: "QQQ", market: "US", currency: "USD", qty: 22, price: 465, liquidityNotional24h: 900000000, tags: ["high"] },
    { symbol: "BND", market: "US", currency: "USD", qty: 35, price: 73, liquidityNotional24h: 240000000, tags: ["low", "bond"] },
    { symbol: "TSLA", market: "US", currency: "USD", qty: 12, price: 235, liquidityNotional24h: 2800000000, tags: ["high"] },
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
