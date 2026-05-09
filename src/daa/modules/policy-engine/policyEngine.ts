import { randomUUID } from "node:crypto";
import type { InvestmentIntent } from "@/src/daa/modules/intents/intentTypes";
import type { PortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateTypes";
import type { PortfolioSignal } from "@/src/daa/modules/signals/signalTypes";
import type { RebalanceProposal, RebalanceTriggerSource } from "@/src/daa/modules/rebalance/rebalanceTypes";

import { calculateActionScore } from "./actionScore";
import { evaluateNoTradeBand } from "./noTradeBand";
import type { DaaPolicyConfig, PolicyDecision, PolicyEvaluationSource } from "./policyTypes";

function sourceFromTrigger(triggerSource: RebalanceTriggerSource, manual: boolean): PolicyEvaluationSource {
  if (manual) return "manual_review";
  if (triggerSource === "scheduled_review") return "scheduled_review";
  if (triggerSource === "drift") return "drift_monitor";
  if (triggerSource === "agent_trigger") return "agent_event";
  if (triggerSource === "risk") return "risk_event";
  if (triggerSource === "cash_idle" || triggerSource === "watchlist_entry") return "cash_event";
  return "manual_review";
}

export function evaluatePortfolioPolicy(input: {
  portfolioState: PortfolioState;
  policy: DaaPolicyConfig;
  signals: PortfolioSignal[];
  intents: InvestmentIntent[];
  proposals: RebalanceProposal[];
  triggerSource: RebalanceTriggerSource;
  manual: boolean;
  latestAutoComparableCycle?: { cycleId: string; createdAt: string } | null;
}): PolicyDecision {
  const createdAt = new Date().toISOString();
  const driftSignals = input.signals.filter((signal) => signal.type === "drift");
  const recentCycleMs = input.latestAutoComparableCycle?.createdAt
    ? Date.parse(input.latestAutoComparableCycle.createdAt)
    : Number.NaN;
  const hasRecentProposal = Number.isFinite(recentCycleMs)
    && recentCycleMs + (input.policy.throttle.proposalDedupeWindowHours * 60 * 60 * 1000) > Date.now();
  const autoExecutionCooling = Number.isFinite(recentCycleMs)
    && recentCycleMs + (input.policy.throttle.autoExecutionCooldownHours * 60 * 60 * 1000) > Date.now();
  const band = evaluateNoTradeBand({ driftSignals, policy: input.policy, hasRecentProposal });
  const score = calculateActionScore({
    portfolioState: input.portfolioState,
    policy: input.policy,
    signals: input.signals,
    intents: input.intents,
    proposals: input.proposals,
  });
  const threshold = input.manual ? 0 : input.policy.actionScore.proposalThreshold;
  const reasons: string[] = [];
  const blockers: string[] = [];
  const hasRiskReductionIntent = input.intents.some((intent) => intent.source === "risk_reduction");
  const hasCashDeployIntent = input.intents.some((intent) => intent.source === "cash_deploy");
  const hasAgentIntent = input.intents.some((intent) => intent.source === "agent_thesis");
  const hasNonDriftProposal = input.proposals.some((proposal) => (proposal.proposalType ?? "drift") !== "drift");

  if (input.manual) {
    reasons.push("人工请求生成建议，跳过自动触发 no-trade band。");
  } else if (hasRiskReductionIntent) {
    reasons.push("存在降风险意图，允许进入提案阶段。");
  } else if (input.triggerSource === "scheduled_review") {
    reasons.push("定期复盘只在 action score 达标时生成调仓提案。");
  } else if (input.triggerSource === "agent_trigger") {
    reasons.push("Agent 投资意图进入策略评估。");
  } else if (band.state === "entered_outer") {
    reasons.push(`最大偏移 ${band.maxAbsDriftPct.toFixed(2)}% 已进入行动外圈。`);
  }

  if (!input.manual
    && !hasRiskReductionIntent
    && !hasCashDeployIntent
    && !hasAgentIntent
    && !hasNonDriftProposal
    && input.triggerSource === "drift"
    && band.state !== "entered_outer") {
    blockers.push(`最大偏移 ${band.maxAbsDriftPct.toFixed(2)}% 尚未进入行动外圈 ${(input.policy.drift.outerBandPct * 100).toFixed(2)}%。`);
  }
  if (!input.manual
    && !hasRiskReductionIntent
    && hasRecentProposal
    && score.score < input.policy.throttle.minScoreToBreakCooldown) {
    blockers.push(`策略建议去重窗口生效中，行动分 ${score.score.toFixed(1)} 低于突破阈值 ${input.policy.throttle.minScoreToBreakCooldown.toFixed(1)}。`);
  }
  if (!input.manual && input.portfolioState.dataHealth.status !== "ok") {
    blockers.push(`组合数据健康状态为 ${input.portfolioState.dataHealth.status}，禁止自动执行。`);
  }
  if (!input.manual && !hasRiskReductionIntent && score.score < threshold) {
    blockers.push(`行动分 ${score.score.toFixed(1)} 低于阈值 ${threshold.toFixed(1)}。`);
  }

  const canPropose = input.manual || hasRiskReductionIntent || blockers.length === 0;
  if (canPropose && !input.manual && autoExecutionCooling && !hasRiskReductionIntent) {
    reasons.push(`自动执行冷静期生效中，本轮最多生成建议，不自动下单。`);
  }
  const autoExecute = canPropose
    && score.score >= input.policy.actionScore.autoExecuteThreshold
    && (!autoExecutionCooling || hasRiskReductionIntent)
    && input.portfolioState.dataHealth.status === "ok";
  return {
    decisionId: `policy_${randomUUID()}`,
    source: sourceFromTrigger(input.triggerSource, input.manual),
    triggerSource: input.triggerSource,
    action: canPropose ? (autoExecute ? "authorize_auto_execute" : "propose") : "observe",
    score: Number(score.score.toFixed(2)),
    threshold,
    reasons,
    blockers,
    noTradeBandState: band.state,
    costBenefit: score.costBenefit,
    audit: {
      maxAbsDriftPct: band.maxAbsDriftPct,
      topDriftAssetKey: band.topSignal?.assetKey ?? null,
      signalCount: input.signals.length,
      intentCount: input.intents.length,
      proposalCount: input.proposals.length,
      dataHealth: input.portfolioState.dataHealth,
      recentComparableCycleId: input.latestAutoComparableCycle?.cycleId ?? null,
    },
    createdAt,
  };
}
