import { formatAssetLabel } from "@/src/daa/assetRegistry";
import type { AgentStrategyOverlay } from "@/src/daa/agent/cognitiveTypes";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { RebalanceTriggerSource } from "@/src/daa/modules/rebalance/rebalanceTypes";
import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

type AutoExecuteBreachProposal = {
  assetKey?: string | null;
  symbol?: string | null;
  suggestedNotional?: number | null;
  selected?: boolean | null;
};

type RecentExecutedTradeForReversal = {
  ticketId?: string | null;
  cycleId?: string | null;
  assetKey?: string | null;
  symbol?: string | null;
  side?: string | null;
  status?: string | null;
  executedAt?: string | null;
  createdAt?: string | null;
};

type AutoReversalBlockedProposal<T> = T & {
  blockedReason: string;
  cooldownUntil: string;
  lastTrade: RecentExecutedTradeForReversal;
};

type AutoTradeStabilityBlockedProposal<T> = T & {
  blockedReason: string;
  cooldownUntil: string | null;
  lastTrade: RecentExecutedTradeForReversal | null;
};

export function buildEmptyAutoTriggerSkipMessage(input: {
  triggerSource: RebalanceTriggerSource;
  manual: boolean;
  proposalCount: number;
  agentSummary?: string | null;
}): string | null {
  if (input.manual || input.proposalCount > 0) return null;

  const summary = input.agentSummary ? `（${input.agentSummary}）` : "";
  if (input.triggerSource === "agent_trigger") {
    return `Agent 主动调仓未生成可执行提案，跳过创建周期${summary}。`;
  }
  if (input.triggerSource === "scheduled_review") {
    return `定期组合复盘未生成可执行提案，跳过创建周期${summary}。`;
  }
  if (input.triggerSource === "drift") {
    return `偏移检查未生成可执行提案，跳过创建周期${summary}。`;
  }
  return `自动触发未生成可执行提案，跳过创建周期${summary}。`;
}

export function findAutoExecuteSingleOrderBreach(input: {
  totalEquity: number;
  maxSinglePct: number;
  proposals: AutoExecuteBreachProposal[];
}): (AutoExecuteBreachProposal & { message: string }) | null {
  const totalEquity = Math.max(0, Number(input.totalEquity) || 0);
  const maxSinglePct = Math.max(0, Number(input.maxSinglePct) || 0);
  if (!(totalEquity > 0) || !(maxSinglePct > 0)) return null;

  const proposal = input.proposals.find((row) => {
    if (row.selected === false) return false;
    const notional = Math.max(0, Number(row.suggestedNotional) || 0);
    return notional / totalEquity > maxSinglePct;
  });
  if (!proposal) return null;

  const label = formatAssetLabel({ symbol: proposal.symbol || undefined, assetKey: proposal.assetKey || undefined });
  const notional = Math.max(0, Number(proposal.suggestedNotional) || 0);
  return {
    ...proposal,
    message: `[PolicyExecution 单笔上限守门] ${label} 单笔 $${notional.toFixed(0)} 超过 NAV 的 ${(maxSinglePct * 100).toFixed(1)}% 上限，已阻止自动执行`,
  };
}

export function findAutoExecuteTurnoverBreach(input: {
  totalEquity: number;
  maxTurnoverPct: number;
  proposals: AutoExecuteBreachProposal[];
}): { totalNotional: number; message: string } | null {
  const totalEquity = Math.max(0, Number(input.totalEquity) || 0);
  const maxTurnoverPct = Math.max(0, Number(input.maxTurnoverPct) || 0);
  if (!(totalEquity > 0) || !(maxTurnoverPct > 0)) return null;

  const totalNotional = input.proposals
    .filter((row) => row.selected !== false)
    .reduce((sum, row) => sum + Math.max(0, Number(row.suggestedNotional) || 0), 0);
  if (!(totalNotional / totalEquity > maxTurnoverPct)) return null;

  return {
    totalNotional,
    message: `[maxOrderPctOfNav 守门] 自动执行总换手 $${totalNotional.toFixed(0)} 超过 NAV 的 ${(maxTurnoverPct * 100).toFixed(1)}% 上限，已阻止自动执行`,
  };
}

function isOppositeSide(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = String(a || "").trim().toUpperCase();
  const right = String(b || "").trim().toUpperCase();
  return (left === "BUY" && right === "SELL") || (left === "SELL" && right === "BUY");
}

function toTradeMs(trade: RecentExecutedTradeForReversal): number {
  const text = trade.executedAt || trade.createdAt || "";
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : NaN;
}

export function filterRecentAutoTradeReversals<T extends {
  assetKey: string;
  symbol?: string | null;
  side: "BUY" | "SELL";
  selected?: boolean | null;
}>(input: {
  proposals: T[];
  recentTrades: RecentExecutedTradeForReversal[];
  nowMs?: number;
  buyToSellCooldownDays?: number;
  sellToBuyCooldownDays?: number;
}): {
  proposals: T[];
  blocked: Array<AutoReversalBlockedProposal<T>>;
} {
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const buyToSellCooldownMs = Math.max(0, Number(input.buyToSellCooldownDays ?? 14) || 0) * 24 * 60 * 60 * 1000;
  const sellToBuyCooldownMs = Math.max(0, Number(input.sellToBuyCooldownDays ?? 3) || 0) * 24 * 60 * 60 * 1000;
  const executedTrades = input.recentTrades
    .filter((trade) => String(trade.status || "").trim().toLowerCase() === "executed")
    .map((trade) => ({ trade, ms: toTradeMs(trade) }))
    .filter((row) => Number.isFinite(row.ms))
    .sort((a, b) => b.ms - a.ms);

  const proposals: T[] = [];
  const blocked: Array<AutoReversalBlockedProposal<T>> = [];

  for (const proposal of input.proposals) {
    if (proposal.selected === false) {
      proposals.push(proposal);
      continue;
    }
    const assetKey = proposal.assetKey.toUpperCase();
    const tradeRow = executedTrades.find(({ trade }) => (
      String(trade.assetKey || "").trim().toUpperCase() === assetKey
      && isOppositeSide(trade.side, proposal.side)
    ));
    if (!tradeRow) {
      proposals.push(proposal);
      continue;
    }

    const cooldownMs = String(tradeRow.trade.side || "").trim().toUpperCase() === "BUY"
      ? buyToSellCooldownMs
      : sellToBuyCooldownMs;
    if (!(cooldownMs > 0) || tradeRow.ms + cooldownMs <= nowMs) {
      proposals.push(proposal);
      continue;
    }

    const cooldownUntil = new Date(tradeRow.ms + cooldownMs).toISOString();
    const label = formatAssetLabel({ symbol: proposal.symbol || tradeRow.trade.symbol || undefined, assetKey: proposal.assetKey });
    blocked.push({
      ...proposal,
      lastTrade: tradeRow.trade,
      cooldownUntil,
      blockedReason: `${label} 最近 ${tradeRow.trade.side} 后尚在反向交易冷却期，自动 ${proposal.side} 已跳过（冷却至 ${cooldownUntil}）`,
    });
  }

  return { proposals, blocked };
}

export function filterAutoTradeStability<T extends {
  assetKey: string;
  symbol?: string | null;
  side: "BUY" | "SELL";
  suggestedNotional?: number | null;
  targetWeightPct?: number | null;
  reason?: string | null;
  selected?: boolean | null;
}>(input: {
  proposals: T[];
  recentTrades: RecentExecutedTradeForReversal[];
  totalEquity: number;
  currentTargetWeightPctByAssetKey?: Record<string, number>;
  nowMs?: number;
  minHoursBetweenTrades?: number;
  minTradeWeightDeltaPct?: number;
  largeTargetReductionPct?: number;
}): {
  proposals: T[];
  blocked: Array<AutoTradeStabilityBlockedProposal<T>>;
} {
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const totalEquity = Math.max(0, Number(input.totalEquity) || 0);
  const minHoursBetweenTrades = Math.max(0, Number(input.minHoursBetweenTrades ?? 24) || 0);
  const minTradeWeightDeltaPct = Math.max(0, Number(input.minTradeWeightDeltaPct ?? 2) || 0);
  const largeTargetReductionPct = Math.max(0, Number(input.largeTargetReductionPct ?? 5) || 0);
  const currentTargetPctByAssetKey = new Map(
    Object.entries(input.currentTargetWeightPctByAssetKey || {}).map(([assetKey, value]) => [
      assetKey.trim().toUpperCase(),
      Math.max(0, Number(value) || 0),
    ]),
  );

  const executedTrades = input.recentTrades
    .filter((trade) => String(trade.status || "").trim().toLowerCase() === "executed")
    .map((trade) => ({ trade, ms: toTradeMs(trade) }))
    .filter((row) => Number.isFinite(row.ms))
    .sort((a, b) => b.ms - a.ms);

  const proposals: T[] = [];
  const blocked: Array<AutoTradeStabilityBlockedProposal<T>> = [];

  for (const proposal of input.proposals) {
    if (proposal.selected === false) {
      proposals.push(proposal);
      continue;
    }

    const assetKey = proposal.assetKey.trim().toUpperCase();
    const label = formatAssetLabel({ symbol: proposal.symbol || undefined, assetKey: proposal.assetKey });
    const rawNextTargetPct = Number(proposal.targetWeightPct);
    const hasProposalTargetPct = proposal.targetWeightPct != null && Number.isFinite(rawNextTargetPct);
    const nextTargetPct = hasProposalTargetPct ? Math.max(0, rawNextTargetPct) : 0;
    const currentTargetPct = currentTargetPctByAssetKey.get(assetKey) ?? 0;
    const targetDeltaPct = hasProposalTargetPct ? Math.abs(nextTargetPct - currentTargetPct) : 0;
    const targetReductionPct = hasProposalTargetPct ? Math.max(0, currentTargetPct - nextTargetPct) : 0;
    const reason = String(proposal.reason || "");
    const explicitRiskExit = proposal.side === "SELL" && (
      (hasProposalTargetPct && nextTargetPct <= 0.1)
      || targetReductionPct + 1e-9 >= largeTargetReductionPct
      || /止损|风险退出|清仓|强制退出|risk exit|stop[- ]?loss/i.test(reason)
    );

    const fallbackTradeDeltaPct = totalEquity > 0
      ? Math.max(0, Number(proposal.suggestedNotional ?? 0) || 0) / totalEquity * 100
      : Number.POSITIVE_INFINITY;
    const executionDeltaPct = hasProposalTargetPct && currentTargetPctByAssetKey.has(assetKey) ? targetDeltaPct : fallbackTradeDeltaPct;
    if (!explicitRiskExit && executionDeltaPct + 1e-9 < minTradeWeightDeltaPct) {
      blocked.push({
        ...proposal,
        lastTrade: null,
        cooldownUntil: null,
        blockedReason: `${label} 目标权重变化约 ${executionDeltaPct.toFixed(2)}%，低于 ${minTradeWeightDeltaPct.toFixed(1)}% 执行阈值，仅更新目标权重，暂不下单。`,
      });
      continue;
    }

    const tradeRow = executedTrades.find(({ trade }) => (
      String(trade.assetKey || "").trim().toUpperCase() === assetKey
    ));
    if (tradeRow && minHoursBetweenTrades > 0 && tradeRow.ms + minHoursBetweenTrades * 60 * 60 * 1000 > nowMs && !explicitRiskExit) {
      const cooldownUntil = new Date(tradeRow.ms + minHoursBetweenTrades * 60 * 60 * 1000).toISOString();
      blocked.push({
        ...proposal,
        lastTrade: tradeRow.trade,
        cooldownUntil,
        blockedReason: `${label} 最近 24 小时内已有 ${tradeRow.trade.side} 成交，自动 ${proposal.side} 已跳过（稳定器冷却至 ${cooldownUntil}）。`,
      });
      continue;
    }

    proposals.push(proposal);
  }

  return { proposals, blocked };
}

export function shouldSendAgentBriefingTelegram(config: DaaSystemConfig): boolean {
  return config.notification.telegram.enabled === true
    && config.notification.telegram.dailyReport === true;
}

type AgentTargetWeightOverrides = {
  targetWeightOverrides: Record<string, number>;
  baselineTargetWeights: Record<string, number>;
  acceptedCount: number;
  skippedCount: number;
  reason: string;
  summary: string;
};

export function buildAgentTargetWeightOverrides(input: {
  overlay: AgentStrategyOverlay | null;
  knownAssetKeys: string[];
  currentTargetWeights?: Record<string, number>;
  maxPositionPct: number;
  minConfidence?: number;
}): AgentTargetWeightOverrides | null {
  const plan = input.overlay?.targetAllocationPlan;
  const intents = Array.isArray(plan?.intents) ? plan.intents : [];
  if (intents.length === 0) return null;

  const known = new Map<string, string>();
  for (const key of input.knownAssetKeys) {
    const canonical = String(key || "").trim();
    if (!canonical) continue;
    known.set(canonical.toUpperCase(), canonical);
  }
  const maxPositionPct = Math.max(0, Number(input.maxPositionPct) || 0);
  const minConfidence = Math.max(0, Number(input.minConfidence ?? 70) || 0);
  const currentTargetWeights = new Map(
    Object.entries(input.currentTargetWeights || {}).map(([assetKey, value]) => [
      assetKey.trim().toUpperCase(),
      Math.max(0, Number(value) || 0),
    ]),
  );
  const targetWeightOverrides: Record<string, number> = {};
  const baselineTargetWeights: Record<string, number> = {};
  const acceptedLabels: string[] = [];
  let skippedCount = 0;

  for (const intent of intents) {
    const assetKey = String(intent.assetKey || "").trim();
    const symbol = String(intent.symbol || assetKey).trim();
    const proposedPct = Number(intent.proposedTargetWeightPct);
    const confidence = Number(intent.confidence);
    const canonicalAssetKey = known.get(assetKey.toUpperCase());
    if (!assetKey || !canonicalAssetKey) {
      skippedCount += 1;
      continue;
    }
    if (!Number.isFinite(proposedPct) || proposedPct < 0 || !Number.isFinite(confidence) || confidence < minConfidence) {
      skippedCount += 1;
      continue;
    }

    const targetPct = Math.min(proposedPct / 100, maxPositionPct > 0 ? maxPositionPct : proposedPct / 100);
    targetWeightOverrides[canonicalAssetKey] = Number(Math.max(0, targetPct).toFixed(6));
    baselineTargetWeights[canonicalAssetKey] = Number(Math.max(0, currentTargetWeights.get(canonicalAssetKey.toUpperCase()) ?? 0).toFixed(6));
    acceptedLabels.push(`${symbol || canonicalAssetKey}→${(targetWeightOverrides[canonicalAssetKey] * 100).toFixed(1)}%`);
  }

  if (acceptedLabels.length === 0) return null;
  const summary = String(plan?.reasoning || "Agent 目标权重计划").trim() || "Agent 目标权重计划";
  return {
    targetWeightOverrides,
    baselineTargetWeights,
    acceptedCount: acceptedLabels.length,
    skippedCount,
    reason: acceptedLabels.join(", "),
    summary,
  };
}

export function applyTargetWeightOverridesToBootstrap(
  bootstrap: WorkbenchBootstrap,
  targetWeightOverrides: Record<string, number> | null | undefined,
): WorkbenchBootstrap {
  const entries = Object.entries(targetWeightOverrides || {})
    .map(([assetKey, value]) => [assetKey.toUpperCase(), Math.max(0, Number(value) || 0)] as const)
    .filter(([, value]) => Number.isFinite(value));
  if (entries.length === 0) return bootstrap;

  const byAssetKey = new Map(entries);
  return {
    ...bootstrap,
    assetUniverse: bootstrap.assetUniverse.map((row) => {
      const targetWeight = byAssetKey.get(row.assetKey.toUpperCase());
      if (targetWeight == null) return row;
      const targetWeightPct = Number((targetWeight * 100).toFixed(6));
      const actualWeightPct = Math.max(0, Number(row.actualWeightPct) || 0);
      return {
        ...row,
        targetWeightPct,
        targetWeightHint: targetWeight,
        gapPct: Number((targetWeightPct - actualWeightPct).toFixed(6)),
      };
    }),
  };
}
