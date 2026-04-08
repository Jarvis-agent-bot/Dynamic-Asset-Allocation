import { clamp } from "@/src/core/math";
import type { DaaMarketIndicatorsConfig } from "@/src/daa/config/systemConfig";
import type { LlmDecisionOutput, LlmPerAssetAdjustment } from "@/src/daa/llm/llmDecision";
import { MARKET_SCOPE_LABEL_ZH_, resolveMarketScopeForAsset } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import {
  getIndicatorByKey,
  isHighRiskAsset,
  mergeMarketRegimeConservatively,
  resolveRelevantMarketScopeContext,
} from "@/src/daa/modules/marketContext/marketContextOverlay";
import type { DaaMarketContext, DaaMarketIndicatorScope, DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";
import type { DaaFusedOpportunity } from "@/src/daa/signals/fusion";
import type { ProposalDecisionContext, RebalanceProposal } from "./workbenchTypes";

type FusedProposal = RebalanceProposal & {
  decisionContext: ProposalDecisionContext;
};

type DecisionFusionInput = {
  draftProposals: RebalanceProposal[];
  fusedOpportunities: DaaFusedOpportunity[];
  llmDecision: LlmDecisionOutput;
  marketContext?: DaaMarketContext | null;
  marketConfig?: Pick<DaaMarketIndicatorsConfig, "overlays"> | null;
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

type DecisionFusionResult = {
  proposals: FusedProposal[];
  marketRegime: DaaMarketRegime | null;
  overallConfidence: number;
  fusionWarnings: string[];
  llmStatus: LlmDecisionOutput["status"];
  llmSummary: string;
};

const DESELECT_THRESHOLD = 0.15;


function buildMarketIndicatorFlags(marketContext: DaaMarketContext | null | undefined, scopeKeys: string[]): string[] {
  if (!marketContext) return [];
  const flags: string[] = [];
  const vix = getIndicatorByKey(marketContext, "vix");
  const qqqSpy = getIndicatorByKey(marketContext, "qqq_spy_ratio");
  const fxiVol = getIndicatorByKey(marketContext, "fxi_volatility");
  const kwebFxi = getIndicatorByKey(marketContext, "kweb_fxi_ratio");
  const btcEth = getIndicatorByKey(marketContext, "btc_eth_ratio");
  const btcVol = getIndicatorByKey(marketContext, "btc_volatility");
  const goldSilver = getIndicatorByKey(marketContext, "gold_silver_ratio");

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

function marketRegimeLabelZhLocal(regime: DaaMarketRegime | null | undefined): string {
  if (regime === "risk_off") return "偏防守";
  if (regime === "risk_on") return "偏进攻";
  if (regime === "transitional") return "过渡";
  return "待计算";
}

export function fuseDecision(input: DecisionFusionInput): DecisionFusionResult {

  const { draftProposals, fusedOpportunities, llmDecision, marketContext } = input;
  const fusionWarnings: string[] = [];
  const signalMap = new Map<string, DaaFusedOpportunity>();
  for (const opp of fusedOpportunities) {
    signalMap.set(opp.symbol.toUpperCase(), opp);
  }

  const llmMap = new Map<string, LlmPerAssetAdjustment>();
  for (const adj of llmDecision.perAssetAdjustments) {
    if (adj.symbol) llmMap.set(adj.symbol.toUpperCase(), adj);
  }

  const globalRuleBasedMarketRegime = marketContext?.regime ?? null;
  const llmMarketRegime = llmDecision.status === "ok" ? llmDecision.marketRegime : null;
  const effectiveMarketRegime = mergeMarketRegimeConservatively(globalRuleBasedMarketRegime, llmMarketRegime);

  const proposals: FusedProposal[] = draftProposals.map((proposal) => {
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
      const sideZh = proposal.side === "BUY" ? "买入" : "卖出";
      const actionZh = signal.action === "open_or_add" ? "可建仓/加仓" : signal.action === "reduce_or_avoid" ? "减仓/回避" : "观望";
      conflictFlags.push(
        `信号冲突：漂移方向 ${sideZh}，信号建议 ${actionZh}（评分 ${signal.finalScorePct.toFixed(0)}，置信度 ${signal.confidencePct.toFixed(0)}）`,
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
    const marketScope = resolveMarketScopeForAsset({
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
    const marketScopeLabel = MARKET_SCOPE_LABEL_ZH_[marketScope] || "组合";
    const scopeContext = resolveRelevantMarketScopeContext({
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
    const effectiveProposalMarketRegime = mergeMarketRegimeConservatively(ruleBasedMarketRegime, llmMarketRegime);
    const isHighRisk = isHighRiskAsset({
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
      reasonParts.push(`市场: ${marketScopeLabel} ${marketRegimeLabelZhLocal(effectiveProposalMarketRegime || scopeContext.regime)} / 执行 ${Math.round(scale * 100)}%`);
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
      ...buildMarketIndicatorFlags(marketContext, [marketScope]),
      ...(isHighRisk ? ["high_risk_asset"] : []),
    ];

    const context: ProposalDecisionContext = {
      driftReason: proposal.reason,
      signalAction: signal?.action ?? null,
      signalScore: signal?.finalScorePct ?? null,
      signalConfidence: signal?.confidencePct ?? null,
      signalConflict,
      llmAdjustment: (llmAdj && llmDecision.status === "ok") ? llmAdj.adjustment : null,
      llmConfidence: (llmAdj && llmDecision.status === "ok") ? llmAdj.confidencePct : null,
      llmRationale: (llmAdj && llmDecision.status === "ok") ? llmAdj.rationale : null,
      llmSuggestedWeights: (llmAdj && llmDecision.status === "ok") ? llmAdj.suggestedWeights ?? null : null,
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
