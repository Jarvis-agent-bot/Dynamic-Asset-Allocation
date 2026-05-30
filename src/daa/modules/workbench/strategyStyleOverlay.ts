import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { RebalanceProposal, ProposalDecisionContext } from "@/src/daa/modules/rebalance/rebalanceTypes";
import type { WorkbenchBootstrap } from "./workbenchTypes";
import { buildVolumeBreakoutSignalForSymbol, type DaaBreakoutSignal } from "@/src/daa/signals/breakoutSignal";
import { normalizeText, toFinite } from "@/src/daa/utils/normalize";

type StrategyStyleOverlayResult = {
  proposals: RebalanceProposal[];
  blocked: Array<{
    assetKey: string;
    symbol: string;
    reason: string;
    signal: DaaBreakoutSignal;
  }>;
};

function mergeDecisionContext(input: {
  proposal: RebalanceProposal;
  signal: DaaBreakoutSignal;
  multiplier: number;
  adjustment: ProposalDecisionContext["llmAdjustment"];
  reason: string;
}): ProposalDecisionContext {
  const current = input.proposal.decisionContext;
  const action = input.signal.action === "open_or_add"
    ? "open_or_add"
    : input.signal.action === "reduce_or_avoid"
      ? "reduce_or_avoid"
      : "watch";
  return {
    driftReason: current?.driftReason || input.proposal.reason,
    signalAction: current?.signalAction ?? action,
    signalScore: Math.max(current?.signalScore ?? 0, input.signal.scorePct),
    signalConfidence: Math.max(current?.signalConfidence ?? 0, input.signal.confidencePct),
    signalConflict: current?.signalConflict ?? false,
    llmAdjustment: input.adjustment,
    llmConfidence: current?.llmConfidence ?? null,
    llmRationale: current?.llmRationale ?? null,
    ruleBasedMarketRegime: current?.ruleBasedMarketRegime ?? null,
    llmMarketRegime: current?.llmMarketRegime ?? null,
    effectiveMarketRegime: current?.effectiveMarketRegime ?? null,
    marketScope: current?.marketScope ?? null,
    marketScopeLabel: current?.marketScopeLabel ?? null,
    marketIndicatorFlags: [
      ...(current?.marketIndicatorFlags ?? []),
      `策略风格: ${input.reason}`,
    ],
    conflictFlags: current?.conflictFlags ?? [],
    finalQtyMultiplier: (current?.finalQtyMultiplier ?? 1) * input.multiplier,
    assetBudgetKey: current?.assetBudgetKey ?? null,
    assetBudgetLabel: current?.assetBudgetLabel ?? null,
    assetBudgetStance: current?.assetBudgetStance ?? null,
    assetBudgetScale: current?.assetBudgetScale ?? null,
    macroShadowNotional: current?.macroShadowNotional ?? null,
    macroShadowQty: current?.macroShadowQty ?? null,
    macroShadowDeltaNotional: current?.macroShadowDeltaNotional ?? null,
    macroShadowReason: current?.macroShadowReason ?? null,
  };
}

function scaleProposal(proposal: RebalanceProposal, multiplier: number): RebalanceProposal {
  const safeMultiplier = Math.max(0, Number.isFinite(multiplier) ? multiplier : 1);
  return {
    ...proposal,
    suggestedQty: proposal.suggestedQty * safeMultiplier,
    suggestedNotional: proposal.suggestedNotional * safeMultiplier,
  };
}

function styleReason(signal: DaaBreakoutSignal): string {
  if (signal.triggered) return `放量突破确认，score ${signal.scorePct.toFixed(1)}`;
  if (signal.action === "reduce_or_avoid") return `趋势未确认，score ${signal.scorePct.toFixed(1)}`;
  if (signal.action === "unavailable") return "放量突破数据不可用";
  return `未触发突破，score ${signal.scorePct.toFixed(1)}`;
}

export async function applyStrategyStyleOverlay(input: {
  proposals: RebalanceProposal[];
  bootstrap: WorkbenchBootstrap;
  systemConfig: DaaSystemConfig;
}): Promise<StrategyStyleOverlayResult> {
  const style = input.systemConfig.strategy.style;
  const breakout = input.systemConfig.strategy.breakout;
  if (style === "classic_rebalance" || breakout.enabled === false) {
    return { proposals: input.proposals, blocked: [] };
  }

  const assetByKey = new Map(input.bootstrap.assetUniverse.map((row) => [row.assetKey.toUpperCase(), row] as const));
  const signalByAssetKey = new Map<string, DaaBreakoutSignal>();
  const buyProposals = input.proposals.filter((proposal) => (
    proposal.side === "BUY"
    && (proposal.proposalType ?? "drift") === "drift"
  ));

  await Promise.all(buyProposals.map(async (proposal) => {
    const key = proposal.assetKey.toUpperCase();
    if (signalByAssetKey.has(key)) return;
    const asset = assetByKey.get(key);
    const symbol = normalizeText(asset?.symbol || proposal.symbol).toUpperCase();
    if (!symbol) return;
    const signal = await buildVolumeBreakoutSignalForSymbol({
      symbol,
      market: asset?.market,
      currency: asset?.currency || proposal.currency,
      params: breakout,
    });
    signalByAssetKey.set(key, signal);
  }));

  const out: RebalanceProposal[] = [];
  const blocked: StrategyStyleOverlayResult["blocked"] = [];

  for (const proposal of input.proposals) {
    if (proposal.side !== "BUY" || (proposal.proposalType ?? "drift") !== "drift") {
      out.push(proposal);
      continue;
    }

    const signal = signalByAssetKey.get(proposal.assetKey.toUpperCase());
    if (!signal || signal.action === "unavailable") {
      if (style === "breakout_growth") {
        const fallbackSignal = signal ?? {
          symbol: proposal.symbol,
          action: "unavailable" as const,
          scorePct: 0,
          confidencePct: 0,
          triggered: false,
          metrics: {
            close: 0,
            priorHighClose: null,
            volumeRatio: null,
            maFast: null,
            maSlow: null,
            maSlowRising: false,
            extensionPct: null,
          },
          reasons: ["放量突破数据不可用"],
        };
        blocked.push({
          assetKey: proposal.assetKey,
          symbol: proposal.symbol,
          reason: "突破成长风格要求放量突破信号，当前数据不可用",
          signal: fallbackSignal,
        });
        continue;
      }
      out.push(proposal);
      continue;
    }

    if (style === "breakout_growth" && !signal.triggered) {
      blocked.push({
        assetKey: proposal.assetKey,
        symbol: proposal.symbol,
        reason: `突破成长风格暂缓买入：${styleReason(signal)}`,
        signal,
      });
      continue;
    }

    let multiplier = 1;
    let adjustment: ProposalDecisionContext["llmAdjustment"] = null;
    if (style === "balanced_breakout") {
      if (signal.triggered) {
        multiplier = breakout.balancedBoostMultiplier;
        adjustment = "increase_priority";
      } else if (signal.action === "reduce_or_avoid") {
        multiplier = breakout.balancedWeakMultiplier;
        adjustment = "reduce_size";
      }
    }

    const adjusted = scaleProposal(proposal, multiplier);
    const reason = styleReason(signal);
    out.push({
      ...adjusted,
      reason: `${proposal.reason} | 风格过滤: ${reason}`,
      decisionContext: mergeDecisionContext({
        proposal,
        signal,
        multiplier,
        adjustment,
        reason,
      }),
    });
  }

  return {
    proposals: out.filter((proposal) => toFinite(proposal.suggestedNotional, 0) > 0 && toFinite(proposal.suggestedQty, 0) > 0),
    blocked,
  };
}
