/**
 * Type definitions extracted from the former unifiedRebalance module.
 * The implementation (buildDaaUnifiedPlan etc.) was removed as dead code;
 * only the type aliases survive because they are referenced by the
 * decision / hydrate / workbench-read / human-signals layers.
 */

import type { SuggestedOrder } from "@/src/core/rebalanceCore";

export type DaaRiskTier = "low" | "mid" | "high";
export type DaaMomentumRegime = "strong" | "neutral" | "weak";
export type DaaAnalystStance = "offensive" | "neutral" | "defensive";

export type DaaUnifiedPosition = {
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

export type DaaUnifiedCandidateAsset = {
  symbol: string;
  market?: string;
  currency?: string;
  targetWeightHint?: number;
  enabled?: boolean;
  tags?: string[];
  notes?: string;
};

export type DaaUnifiedFxRate = {
  baseCcy: string;
  quoteCcy: string;
  rate: number;
  source?: string;
  asOfTs?: string;
};

export type DaaUnifiedAnalyst = {
  analystId: string;
  accuracyPct: number;
  riskControlPct: number;
  disciplinePct: number;
  transparencyPct: number;
  stance?: DaaAnalystStance;
  styleCluster?: string;
};

export type DaaUnifiedAssetView = {
  symbol: string;
  analystId: string;
  convictionPct: number;
  thesisDriftPct: number;
  momentumRegime?: DaaMomentumRegime;
};

export type DaaUnifiedHumanSignal = {
  symbol: string;
  aggregatedScorePct: number;
  convictionPct: number;
  thesisDriftPct: number;
  confidencePct?: number;
  momentumRegime?: DaaMomentumRegime;
  stance?: DaaAnalystStance;
  riskTags?: string[];
  sourceRefs?: string[];
};

export type DaaUnifiedRequest = {
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
  positions: DaaUnifiedPosition[];
  candidateAssets?: DaaUnifiedCandidateAsset[];
  fxRates?: DaaUnifiedFxRate[];
  analysts?: DaaUnifiedAnalyst[];
  assetViews?: DaaUnifiedAssetView[];
  humanSignals?: DaaUnifiedHumanSignal[];
};

export type DaaHumanFactorDecision = {
  symbol: string;
  weightedScorePct: number;
  weightedDriftPct: number;
  tier: "elite" | "steady" | "watch" | "isolated";
  momentumRegime: DaaMomentumRegime;
  multiplier: number;
  reasons: string[];
};

export type DaaExecutableOrder = SuggestedOrder & {
  assetKey: string;
  market: string;
  instrumentCurrency: string;
  qty?: number;
  price?: number;
  cappedBy: string[];
};

export type DaaBlockedOrder = SuggestedOrder & {
  assetKey: string;
  market: string;
  instrumentCurrency: string;
  qty?: number;
  price?: number;
  blockedBy: string;
};

export type DaaUnifiedResponse = {
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
      riskTierBudget: Record<DaaRiskTier, number>;
    };
    humanFactor: {
      assetDecisions: DaaHumanFactorDecision[];
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
  executableOrders: DaaExecutableOrder[];
  blockedOrders: DaaBlockedOrder[];
  warnings: string[];
};
