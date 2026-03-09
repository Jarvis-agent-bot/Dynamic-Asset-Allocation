import type { DaaMarketIndicatorsConfigV2 } from "@/src/daa/config/systemConfigV2";
import type { LlmDecisionOutputV2, LlmPerAssetAdjustmentV2 } from "@/src/daa/llm/llmDecisionV2";
import { MARKET_SCOPE_LABEL_ZH_V1, resolveMarketScopeForAssetV1 } from "@/src/daa/modules/marketContext/marketIndicatorCatalogV1";
import {
  getIndicatorByKeyV1,
  isHighRiskAssetV1,
  mergeMarketRegimeConservativelyV1,
  resolveRelevantMarketScopeContextV1,
} from "@/src/daa/modules/marketContext/marketContextOverlayV1";
import type { DaaMarketContextV1, DaaMarketIndicatorScopeV1, DaaMarketRegimeV1 } from "@/src/daa/modules/marketContext/marketContextTypesV1";
import type { DaaFusedOpportunityV1 } from "@/src/daa/signals/fusionV1";
import type { RebalanceProposalV1 } from "./workbenchTypesV1";

export type ProposalDecisionContextV2 = {
  driftReason: string;
  signalAction: DaaFusedOpportunityV1["action"] | null;
  signalScore: number | null;
  signalConfidence: number | null;
  signalConflict: boolean;
  llmAdjustment: LlmPerAssetAdjustmentV2["adjustment"] | null;
  llmConfidence: number | null;
  llmRationale: string | null;
  marketRegime?: DaaMarketRegimeV1 | null;
  ruleBasedMarketRegime?: DaaMarketRegimeV1 | null;
  llmMarketRegime?: DaaMarketRegimeV1 | null;
  effectiveMarketRegime?: DaaMarketRegimeV1 | null;
  marketScope?: DaaMarketIndicatorScopeV1 | null;
  marketScopeLabel?: string | null;
  marketIndicatorFlags?: string[];
  conflictFlags: string[];
  finalQtyMultiplier: number;
};

export type FusedProposalV2 = RebalanceProposalV1 & {
  decisionContext: ProposalDecisionContextV2;
};

export type DecisionFusionInputV2 = {
  draftProposals: RebalanceProposalV1[];
  fusedOpportunities: DaaFusedOpportunityV1[];
  llmDecision: LlmDecisionOutputV2;
  marketContext?: DaaMarketContextV1 | null;
  marketConfig?: Pick<DaaMarketIndicatorsConfigV2, "overlays"> | null;
  assetMetaBySymbol?: Record<string, {
    market?: string;
    assetClass?: string;
    marketGroup?: string;
    instrumentType?: string;
    region?: string;
    exchange?: string;
    holdingTags?: string[];
    watchTags?: string[];
  }>;
};

export type DecisionFusionResultV2 = {
  proposals: FusedProposalV2[];
  marketRegime: DaaMarketRegimeV1 | null;
  overallConfidence: number;
  fusionWarnings: string[];
  llmStatus: LlmDecisionOutputV2["status"];
  llmSummary: string;
};

const DESELECT_THRESHOLD = 0.15;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function buildMarketIndicatorFlagsV1(marketContext: DaaMarketContextV1 | null | undefined, scopeKeys: string[]): string[] {
  if (!marketContext) return [];
  const flags: string[] = [];
  const vix = getIndicatorByKeyV1(marketContext, "vix");
  const qqqSpy = getIndicatorByKeyV1(marketContext, "qqq_spy_ratio");
  const fxiVol = getIndicatorByKeyV1(marketContext, "fxi_volatility");
  const kwebFxi = getIndicatorByKeyV1(marketContext, "kweb_fxi_ratio");
  const btcEth = getIndicatorByKeyV1(marketContext, "btc_eth_ratio");
  const btcVol = getIndicatorByKeyV1(marketContext, "btc_volatility");
  const goldSilver = getIndicatorByKeyV1(marketContext, "gold_silver_ratio");

  if (scopeKeys.includes("us_equity")) {
    if ((vix?.riskOffScorePct ?? 0) >= 75) flags.push("vix_high");
    if ((qqqSpy?.riskOffScorePct ?? 0) >= 75) flags.push("us_growth_weakened");
  }
  if (scopeKeys.includes("hk_cn_equity")) {
    if ((fxiVol?.riskOffScorePct ?? 0) >= 75) flags.push("hk_cn_vol_high");
    if ((kwebFxi?.riskOffScorePct ?? 0) >= 75) flags.push("hk_cn_growth_cold");
  }
  if (scopeKeys.includes("crypto")) {
    if ((btcEth?.riskOffScorePct ?? 0) >= 75) flags.push("btc_dominance_defensive");
    if ((btcVol?.riskOffScorePct ?? 0) >= 75) flags.push("crypto_vol_high");
  }
  if (scopeKeys.includes("macro_defensive") && (goldSilver?.riskOffScorePct ?? 0) >= 75) {
    flags.push("macro_defensive_high");
  }
  return flags;
}

function marketRegimeLabelZhLocalV1(regime: DaaMarketRegimeV1 | null | undefined): string {
  if (regime === "risk_off") return "偏防守";
  if (regime === "risk_on") return "偏进攻";
  if (regime === "transitional") return "过渡";
  return "待计算";
}

export function fuseDecisionV2(input: DecisionFusionInputV2): DecisionFusionResultV2 {

  const { draftProposals, fusedOpportunities, llmDecision, marketContext } = input;
  const fusionWarnings: string[] = [];
  const signalMap = new Map<string, DaaFusedOpportunityV1>();
  for (const opp of fusedOpportunities) {
    signalMap.set(opp.symbol.toUpperCase(), opp);
  }

  const llmMap = new Map<string, LlmPerAssetAdjustmentV2>();
  for (const adj of llmDecision.perAssetAdjustments) {
    if (adj.symbol) llmMap.set(adj.symbol.toUpperCase(), adj);
  }

  const globalRuleBasedMarketRegime = marketContext?.regime ?? null;
  const llmMarketRegime = llmDecision.status === "ok" ? llmDecision.marketRegime : null;
  const effectiveMarketRegime = mergeMarketRegimeConservativelyV1(globalRuleBasedMarketRegime, llmMarketRegime);

  const proposals: FusedProposalV2[] = draftProposals.map((proposal) => {
    const symbol = proposal.symbol.toUpperCase();
    const signal = signalMap.get(symbol) ?? null;
    const llmAdj = llmMap.get(symbol) ?? null;
    const conflictFlags: string[] = [];
    let multiplier = 1.0;

    const signalConflict = signal !== null
      && ((proposal.side === "BUY" && signal.action === "reduce_or_avoid")
        || (proposal.side === "SELL" && signal.action === "open_or_add"));

    if (signalConflict && signal) {
      const penaltyFactor = signal.confidencePct >= 65 ? 0.35 : 0.55;
      multiplier *= penaltyFactor;
      conflictFlags.push(
        `信号冲突：漂移方向 ${proposal.side}，信号建议 ${signal.action}（评分 ${signal.finalScorePct.toFixed(0)}，置信度 ${signal.confidencePct.toFixed(0)}）`,
      );
    }

    if (llmAdj && llmAdj.confidencePct >= 40 && llmDecision.status === "ok") {
      switch (llmAdj.adjustment) {
        case "skip":
          multiplier = 0;
          conflictFlags.push(`AI 建议跳过：${llmAdj.rationale || "无具体原因"}`);
          break;
        case "reduce_size": {
          const reducedTo = clamp(llmAdj.sizeMagnitude, 0, 1);
          multiplier *= reducedTo;
          if (reducedTo < 0.8) {
            conflictFlags.push(`AI 建议缩减至 ${(reducedTo * 100).toFixed(0)}%：${llmAdj.rationale || "无具体原因"}`);
          }
          break;
        }
        case "increase_priority": {
          if (signalConflict && llmAdj.confidencePct >= 65) {
            multiplier = Math.min(1, multiplier * 1.4);
            conflictFlags.push(`AI 高优先级缓解信号冲突（+40% 恢复）：${llmAdj.rationale || "无具体原因"}`);
          } else {
            conflictFlags.push(`AI 标记为高优先级：${llmAdj.rationale || "信号一致，建议重点执行"}`);
          }
          break;
        }
        case "execute": {
          if (signalConflict && llmAdj.confidencePct >= 65) {
            multiplier = Math.min(1, multiplier * 1.4);
            conflictFlags.push(`AI 缓解信号冲突（+40% 恢复）：${llmAdj.rationale || "无具体原因"}`);
          }
          break;
        }
      }
    }

    const assetMeta = input.assetMetaBySymbol?.[symbol] || {};
    const marketScope = resolveMarketScopeForAssetV1({
      symbol,
      market: assetMeta.market,
      assetClass: assetMeta.assetClass,
      marketGroup: assetMeta.marketGroup,
      instrumentType: assetMeta.instrumentType,
      region: assetMeta.region,
      exchange: assetMeta.exchange,
      holdingTags: assetMeta.holdingTags,
      watchTags: assetMeta.watchTags,
    });
    const marketScopeLabel = MARKET_SCOPE_LABEL_ZH_V1[marketScope] || "组合";
    const scopeContext = resolveRelevantMarketScopeContextV1({
      marketContext,
      symbol,
      market: assetMeta.market,
      assetClass: assetMeta.assetClass,
      marketGroup: assetMeta.marketGroup,
      instrumentType: assetMeta.instrumentType,
      region: assetMeta.region,
      exchange: assetMeta.exchange,
      holdingTags: assetMeta.holdingTags,
      watchTags: assetMeta.watchTags,
    });
    const ruleBasedMarketRegime = scopeContext?.regime || globalRuleBasedMarketRegime;
    const effectiveProposalMarketRegime = mergeMarketRegimeConservativelyV1(ruleBasedMarketRegime, llmMarketRegime);
    const isHighRisk = isHighRiskAssetV1({
      symbol,
      holdingTags: assetMeta.holdingTags,
      watchTags: assetMeta.watchTags,
      marketScope,
    });

    if (proposal.side === "BUY" && scopeContext) {
      const marketScale = isHighRisk ? scopeContext.highRiskBuyScale : scopeContext.buyScale;
      multiplier *= clamp(marketScale, 0, 1);
      conflictFlags.push(
        `${marketScopeLabel}${isHighRisk ? "高波动" : "普通"}买入受市场环境约束，执行系数 ${(marketScale * 100).toFixed(0)}%`,
      );
    }

    multiplier = clamp(multiplier, 0, 1);
    const selected = multiplier > DESELECT_THRESHOLD && proposal.selected;
    const finalQty = proposal.suggestedQty * multiplier;
    const finalNotional = proposal.suggestedNotional * multiplier;

    const reasonParts: string[] = [proposal.reason];
    if (signal) {
      reasonParts.push(`信号: ${signal.action}（评分 ${signal.finalScorePct.toFixed(0)}）`);
    }
    if (scopeContext && proposal.side === "BUY") {
      const scale = isHighRisk ? scopeContext.highRiskBuyScale : scopeContext.buyScale;
      reasonParts.push(`市场: ${marketScopeLabel} ${marketRegimeLabelZhLocalV1(effectiveProposalMarketRegime || scopeContext.regime)} / 执行 ${Math.round(scale * 100)}%`);
    }
    if (llmAdj?.rationale && llmDecision.status === "ok") {
      reasonParts.push(`AI: ${llmAdj.rationale}`);
    }

    if (multiplier < 0.5 && multiplier > 0) {
      fusionWarnings.push(`${proposal.symbol} 建议量已缩减至 ${(multiplier * 100).toFixed(0)}%：${conflictFlags[0] ?? "市场或信号约束"}`);
    } else if (multiplier === 0) {
      fusionWarnings.push(`${proposal.symbol} 已被 AI 建议跳过（原因：${conflictFlags[0] ?? "无"}）`);
    }

    const marketIndicatorFlags = [
      ...buildMarketIndicatorFlagsV1(marketContext, [marketScope]),
      ...(isHighRisk ? ["high_risk_asset"] : []),
    ];

    const context: ProposalDecisionContextV2 = {
      driftReason: proposal.reason,
      signalAction: signal?.action ?? null,
      signalScore: signal?.finalScorePct ?? null,
      signalConfidence: signal?.confidencePct ?? null,
      signalConflict,
      llmAdjustment: (llmAdj && llmDecision.status === "ok") ? llmAdj.adjustment : null,
      llmConfidence: (llmAdj && llmDecision.status === "ok") ? llmAdj.confidencePct : null,
      llmRationale: (llmAdj && llmDecision.status === "ok") ? llmAdj.rationale : null,
      marketRegime: effectiveProposalMarketRegime,
      ruleBasedMarketRegime,
      llmMarketRegime,
      effectiveMarketRegime: effectiveProposalMarketRegime,
      marketScope,
      marketScopeLabel,
      marketIndicatorFlags,
      conflictFlags,
      finalQtyMultiplier: multiplier,
    };

    return {
      ...proposal,
      suggestedQty: finalQty,
      suggestedNotional: finalNotional,
      selected,
      reason: reasonParts.join(" | "),
      decisionContext: context,
    };
  });

  return {
    proposals,
    marketRegime: effectiveMarketRegime,
    overallConfidence: llmDecision.overallConfidence,
    fusionWarnings,
    llmStatus: llmDecision.status,
    llmSummary: llmDecision.summary,
  };
}
