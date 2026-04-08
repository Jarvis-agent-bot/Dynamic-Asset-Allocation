import { describe, expect, it } from "vitest";

import { MARKET_SCOPE_LABEL_ZH_ } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import { fuseDecision } from "@/src/daa/modules/workbench/decisionFusion";
import type {
  DaaMarketContext,
  DaaMarketIndicatorScope,
  DaaMarketIndicatorSnapshot,
  DaaMarketScopeContext,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import type { LlmDecisionOutput } from "@/src/daa/llm/llmDecision";
import type { RebalanceProposal } from "@/src/daa/modules/workbench/workbenchTypes";

function makeIndicator(overrides: Partial<DaaMarketIndicatorSnapshot>): DaaMarketIndicatorSnapshot {
  return {
    key: "vix",
    label: "VIX",
    category: "volatility",
    scope: "us_equity",
    stance: "neutral",
    riskOffScorePct: 50,
    confidencePct: 50,
    rawValue: 20,
    unit: "%",
    percentile252: 50,
    zscore60: 0,
    trend1dPct: 0,
    trend7dPct: 0,
    trend30dPct: 0,
    reason: "neutral",
    source: "test",
    generatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeScopeContext(
  scope: DaaMarketIndicatorScope,
  overrides: Partial<DaaMarketScopeContext> = {},
): DaaMarketScopeContext {
  return {
    scope,
    label: MARKET_SCOPE_LABEL_ZH_[scope],
    generatedAt: "2026-03-01T00:00:00.000Z",
    regime: "transitional",
    riskOffScorePct: 50,
    confidencePct: 80,
    buyScale: 0.85,
    highRiskBuyScale: 0.75,
    reasons: ["中性"],
    indicators: [],
    ...overrides,
  };
}

function makeProposal(input: Partial<RebalanceProposal> & Pick<RebalanceProposal, "assetKey" | "symbol" | "side">): RebalanceProposal {
  return {
    assetKey: input.assetKey,
    symbol: input.symbol,
    currency: input.currency || "USD",
    fxRateToBase: input.fxRateToBase ?? 1,
    side: input.side,
    suggestedQty: input.suggestedQty ?? 10,
    suggestedNotional: input.suggestedNotional ?? 1000,
    price: input.price ?? 100,
    reason: input.reason || "drift",
    selected: input.selected ?? true,
    hfContribution: input.hfContribution ?? null,
  };
}

function makeLlmDecision(overrides: Partial<LlmDecisionOutput> = {}): LlmDecisionOutput {
  return {
    status: "skipped",
    marketRegime: "transitional",
    overallConfidence: 50,
    perAssetAdjustments: [],
    cashAdvice: "hold",
    cashRationale: "",
    summary: "skip",
    keyRisks: [],
    keyOpportunities: [],
    provider: "mock",
    model: "mock",
    latencyMs: 1,
    generatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("decision-fusion-v2", () => {
  it("会按资产所属市场分别应用买入执行系数，并保留 SELL 不变", () => {
    const usIndicators = [
      makeIndicator({ key: "vix", label: "VIX", scope: "us_equity", stance: "risk_off", riskOffScorePct: 82, reason: "VIX 高位" }),
      makeIndicator({ key: "qqq_spy_ratio", label: "QQQ/SPY", category: "relative_value", scope: "us_equity", stance: "risk_off", riskOffScorePct: 74, unit: "x", reason: "成长风格走弱" }),
    ];
    const cryptoIndicators = [
      makeIndicator({ key: "btc_eth_ratio", label: "BTC/ETH", category: "relative_value", scope: "crypto", stance: "risk_off", riskOffScorePct: 78, unit: "x", reason: "BTC 主导更强" }),
      makeIndicator({ key: "btc_volatility", label: "BTC 波动率", scope: "crypto", stance: "risk_off", riskOffScorePct: 81, reason: "BTC 波动率偏高" }),
    ];

    const marketContext: DaaMarketContext = {
      generatedAt: "2026-03-01T00:00:00.000Z",
      regime: "risk_off",
      riskOffScorePct: 80,
      confidencePct: 87,
      buyScale: 0.68,
      highRiskBuyScale: 0.48,
      reasons: ["加密市场偏防守", "美股波动抬升"],
      indicators: [...usIndicators, ...cryptoIndicators],
      scopes: [
        makeScopeContext("us_equity", {
          regime: "risk_off",
          riskOffScorePct: 78,
          confidencePct: 88,
          buyScale: 0.7,
          highRiskBuyScale: 0.55,
          reasons: ["VIX 高位", "成长风格走弱"],
          indicators: usIndicators,
        }),
        makeScopeContext("crypto", {
          regime: "risk_off",
          riskOffScorePct: 80,
          confidencePct: 86,
          buyScale: 0.68,
          highRiskBuyScale: 0.48,
          reasons: ["BTC 主导更强", "BTC 波动率偏高"],
          indicators: cryptoIndicators,
        }),
      ],
    };

    const result = fuseDecision({
      draftProposals: [
        makeProposal({ assetKey: "US::BND", symbol: "BND", side: "BUY", suggestedNotional: 1000, suggestedQty: 10 }),
        makeProposal({ assetKey: "CRYPTO::BTC-USD", symbol: "BTC-USD", side: "BUY", suggestedNotional: 1000, suggestedQty: 10 }),
        makeProposal({ assetKey: "US::SPY", symbol: "SPY", side: "SELL", suggestedNotional: 1000, suggestedQty: 10 }),
      ],
      fusedOpportunities: [],
      llmDecision: makeLlmDecision(),
      marketContext,
      assetMetaBySymbol: {
        BND: { market: "US" },
        SPY: { market: "US" },
        "BTC-USD": { watchTags: ["crypto"] },
      },
    });

    expect(result.marketRegime).toBe("risk_off");
    expect(result.proposals[0]?.suggestedNotional).toBeCloseTo(700, 6);
    expect(result.proposals[0]?.decisionContext?.marketScope).toBe("us_equity");
    expect(result.proposals[1]?.suggestedNotional).toBeCloseTo(480, 6);
    expect(result.proposals[1]?.decisionContext?.marketScope).toBe("crypto");
    expect(result.proposals[2]?.suggestedNotional).toBeCloseTo(1000, 6);
    expect(result.proposals[1]?.decisionContext?.marketIndicatorFlags).toEqual(
      expect.arrayContaining(["btc_dominance_defensive", "crypto_vol_high", "high_risk_asset"]),
    );
  });

  it("会让规则层与 AI 市场环境取更保守的一侧", () => {
    const usIndicators = [
      makeIndicator({ key: "vix", label: "VIX", scope: "us_equity", stance: "neutral", riskOffScorePct: 52, reason: "中性偏谨慎" }),
      makeIndicator({ key: "qqq_spy_ratio", label: "QQQ/SPY", category: "relative_value", scope: "us_equity", stance: "neutral", riskOffScorePct: 48, unit: "x", reason: "成长相对中性" }),
    ];
    const marketContext: DaaMarketContext = {
      generatedAt: "2026-03-01T00:00:00.000Z",
      regime: "transitional",
      riskOffScorePct: 52,
      confidencePct: 80,
      buyScale: 0.85,
      highRiskBuyScale: 0.75,
      reasons: ["中性偏谨慎"],
      indicators: usIndicators,
      scopes: [
        makeScopeContext("us_equity", {
          regime: "transitional",
          riskOffScorePct: 52,
          confidencePct: 80,
          buyScale: 0.85,
          highRiskBuyScale: 0.75,
          reasons: ["中性偏谨慎"],
          indicators: usIndicators,
        }),
      ],
    };

    const result = fuseDecision({
      draftProposals: [makeProposal({ assetKey: "US::AAPL", symbol: "AAPL", side: "BUY" })],
      fusedOpportunities: [],
      llmDecision: makeLlmDecision({ status: "ok", marketRegime: "risk_off", summary: "AI 更谨慎" }),
      marketContext,
      assetMetaBySymbol: {
        AAPL: { market: "US" },
      },
    });

    expect(result.marketRegime).toBe("risk_off");
    expect(result.proposals[0]?.decisionContext?.ruleBasedMarketRegime).toBe("transitional");
    expect(result.proposals[0]?.decisionContext?.llmMarketRegime).toBe("risk_off");
    expect(result.proposals[0]?.decisionContext?.effectiveMarketRegime).toBe("risk_off");
    // 1000 × 0.8 (AI 未审核降级) × 0.85 (市场 buyScale) = 680
    expect(result.proposals[0]?.suggestedNotional).toBeCloseTo(680, 6);
  });
});
