import { normalizeDaaCurrencyCode, parseDaaAssetKey } from "@/src/daa/assetKey";
import { recordTradeOutcomeAsEvidence } from "@/src/daa/agent/tradeOutcomeFeedback";
import { getActiveTheses } from "@/src/daa/agent/store/thesisStore";
import { enhanceProposalsWithAgent } from "@/src/daa/agent/agentRebalanceAdapter";
import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import { marketRegimeLabelZh } from "@/src/daa/modules/marketContext/marketIndicatorService";
import { classifyCash } from "./cashClassification";
import {
  applyDaaBrokerOrderSync,
  createDaaRebalanceCycle,
  createDaaTradeTicket,
  executeDaaTradeTickets,
  getDaaRebalanceCycle,
  getDaaSystemConfig,
  listDaaRebalanceCycles,
  listDaaTradeTickets,
  patchDaaRebalanceCycle,
  patchDaaAssetUniverseRow,
  upsertDaaCycleReport,
  type DaaStoreRebalanceCycle,
} from "@/src/daa/store/daaStorePg";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { buildInvestmentIntents } from "@/src/daa/modules/intents/intentBuilder";
import { buildPortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateService";
import { buildProposalPlan } from "@/src/daa/modules/proposal-planner/proposalPlanner";
import { evaluatePortfolioPolicy } from "@/src/daa/modules/policy-engine/policyEngine";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";
import { collectPortfolioSignals } from "@/src/daa/modules/signals/signalCollector";
import { resolveExecutionRoute, syncBrokerOrders } from "./executionVenue";
import type { RebalanceExecuteMode } from "./rebalanceExecuteMode";
import { normalizeText, toFinite } from "@/src/daa/utils/normalize";

import { scanTaxLossHarvestingCandidates } from "./taxLossHarvestingService";
import { generateWatchlistEntryProposals } from "./watchlistEntryService";
import { markWatchlistEntryTriggered } from "@/src/daa/store/watchlistAutoEntryStore";
import type {
  ExecuteRebalanceCycleResult,
  GenerateRebalanceCycleInput,
  GenerateRebalanceCycleResult,
  PortfolioHealthyInsight,
  RebalanceCycle,
  UpdateRebalanceCycleInput,
} from "./workbenchTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  applyTargetWeightOverridesToBootstrap,
  buildEmptyAutoTriggerSkipMessage,
  filterAutoTradeStability,
  filterRecentAutoTradeReversals,
} from "@/src/daa/automation/automationGuards";

import { buildWorkbenchBootstrap } from "./workbenchReadService";
import { validateExecutionRisk } from "./workbenchExecutionService";
import { appendTriggerEventSafe } from "./triggerEvent";
import {
  buildReviewPeriodKey,
  getZonedYmd,
  isPastUtcTime,
  isReviewMonthDue,
  normalizeTimeZoneOrUtc,
  toIsoByMs,
} from "./reviewSchedule";
import { assertCycleExecutable, assertCycleMutable } from "./cycleGuards";
import { calcHoldingCostPerUnit } from "./executionCost";
import type { RebalanceProposal, RebalanceTriggerSource } from "@/src/daa/modules/rebalance/rebalanceTypes";
import {
  buildCycleDraftFromBootstrap,
  buildPreTradeRiskCheckFromBootstrap,
  enrichRiskCheckWithCorrelation,
  mapStoreCycleToView,
  toCycleReportSnapshot,
} from "./workbenchModeling";

function isAutoCooldownGuardTrigger(input: {
  triggerSource: RebalanceTriggerSource;
  manual: boolean;
}): boolean {
  return !input.manual && input.triggerSource !== "risk";
}

function isCycleWithinCooldownWindow(input: {
  cycle: DaaStoreRebalanceCycle;
  cooldownMs: number;
  nowMs: number;
}): boolean {
  const lastMs = Date.parse(input.cycle.createdAt || input.cycle.snapshotAt);
  return Number.isFinite(lastMs) && lastMs + input.cooldownMs > input.nowMs;
}

function filterSmallCycleProposals(input: {
  proposals: RebalanceProposal[];
  minNotionalBase: number;
}): RebalanceProposal[] {
  const minNotionalBase = Math.max(0, toFinite(input.minNotionalBase, 0));
  if (!(minNotionalBase > 0)) return input.proposals;
  return input.proposals.filter(
    (proposal) => Math.max(0, toFinite(proposal.suggestedNotional, 0)) + 1e-9 >= minNotionalBase,
  );
}

function relabelAgentEntryProposals(input: {
  proposals: RebalanceProposal[];
  bootstrap: Awaited<ReturnType<typeof buildWorkbenchBootstrap>>;
}): RebalanceProposal[] {
  const holdingKeys = new Set(
    input.bootstrap.assetUniverse
      .filter((row) => row.holdingQty > 0)
      .map((row) => row.assetKey.toUpperCase()),
  );
  return input.proposals.map((proposal) => {
    if (proposal.proposalType === "watchlist_entry") return proposal;
    if (proposal.side !== "BUY" || holdingKeys.has(proposal.assetKey.toUpperCase())) return proposal;
    if (!proposal.reason.startsWith("观察列表目标建仓")) return proposal;
    return {
      ...proposal,
      reason: proposal.reason.replace(/^观察列表目标建仓/, "Agent 目标建仓"),
    };
  });
}

function normalizeTargetWeightOverridesSnapshot(
  targetWeightOverrides: Record<string, number> | null | undefined,
): Record<string, number> | null {
  const entries = Object.entries(targetWeightOverrides || {})
    .map(([assetKey, value]) => [
      assetKey.trim().toUpperCase(),
      Math.max(0, Math.min(1, Number(value) || 0)),
    ] as const)
    .filter(([assetKey, value]) => assetKey && Number.isFinite(value));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function readAgentTargetWeightOverridesFromCycle(
  cycle: Pick<DaaStoreRebalanceCycle, "agentDecisionSnapshot">,
): Record<string, number> | null {
  const snapshot = cycle.agentDecisionSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const raw = (snapshot as Record<string, unknown>).targetWeightOverrides;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([assetKey, value]) => [
      assetKey.trim().toUpperCase(),
      Math.max(0, Math.min(1, Number(value) || 0)),
    ] as const)
    .filter(([assetKey, value]) => assetKey && Number.isFinite(value));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export type ExecutedTargetWeightPatch = {
  assetKey: string;
  targetWeightHint: number;
  reason: "agent_target" | "proposal_target";
};

export function buildExecutedTargetWeightPatches(input: {
  cycle: Pick<DaaStoreRebalanceCycle, "agentDecisionSnapshot" | "proposals">;
  cycleLogs: Array<{ assetKey: string; status: string }>;
}): ExecutedTargetWeightPatch[] {
  const executedAssetKeys = new Set(
    input.cycleLogs
      .filter((row) => row.status === "executed")
      .map((row) => row.assetKey.toUpperCase()),
  );
  if (executedAssetKeys.size === 0) return [];

  const patches = new Map<string, ExecutedTargetWeightPatch>();
  const targetWeightOverrides = readAgentTargetWeightOverridesFromCycle(input.cycle);
  for (const [assetKey, targetWeightHint] of Object.entries(targetWeightOverrides || {})) {
    const normalizedKey = assetKey.toUpperCase();
    if (!executedAssetKeys.has(normalizedKey)) continue;
    patches.set(normalizedKey, {
      assetKey: normalizedKey,
      targetWeightHint: Math.max(0, Math.min(1, Number(targetWeightHint) || 0)),
      reason: "agent_target",
    });
  }

  for (const proposal of input.cycle.proposals) {
    const normalizedKey = proposal.assetKey.toUpperCase();
    if (!executedAssetKeys.has(normalizedKey)) continue;
    if (patches.has(normalizedKey)) continue;
    if (proposal.side !== "BUY") continue;
    const targetWeightPct = Number(proposal.targetWeightPct);
    if (!Number.isFinite(targetWeightPct) || targetWeightPct <= 0) continue;
    patches.set(normalizedKey, {
      assetKey: normalizedKey,
      targetWeightHint: Math.max(0, Math.min(1, targetWeightPct / 100)),
      reason: "proposal_target",
    });
  }

  return Array.from(patches.values());
}

async function persistExecutedTargetWeights(input: {
  cycle: DaaStoreRebalanceCycle;
  cycleLogs: Awaited<ReturnType<typeof listDaaTradeTickets>>;
}): Promise<number> {
  const patches = buildExecutedTargetWeightPatches(input);
  if (patches.length === 0) return 0;

  const results = await Promise.allSettled(patches.map(({ assetKey, targetWeightHint }) =>
    patchDaaAssetUniverseRow({
      assetKey,
      watchEnabled: true,
      targetWeightHint,
    }),
  ));
  for (const result of results) {
    if (result.status === "rejected") {
      logSwallowed("workbenchRebalanceCycleService.persistExecutedTarget", result.reason);
    }
  }
  return results.filter((result) => result.status === "fulfilled").length;
}

function isPureRiskReductionAgentCycle(input: {
  bootstrap: Awaited<ReturnType<typeof buildWorkbenchBootstrap>>;
  proposals: RebalanceProposal[];
  maxPositionPct: number;
}): boolean {
  const selectedProposals = input.proposals.filter((proposal) => proposal.selected !== false);
  if (selectedProposals.length === 0) return false;
  if (selectedProposals.some((proposal) => proposal.side === "BUY")) return false;

  const totalEquity = Math.max(0, toFinite(input.bootstrap.account.totalEquity, 0));
  if (!(totalEquity > 0)) return false;
  const maxPositionLimitPct = Math.max(0, Number(input.maxPositionPct) || 0) * 100;
  const currentValueByAssetKey = new Map(
    input.bootstrap.assetUniverse.map((row) => [row.assetKey.toUpperCase(), Math.max(0, toFinite(row.valuationBase, 0))] as const),
  );
  const actualWeightPctByAssetKey = new Map(
    input.bootstrap.assetUniverse.map((row) => [row.assetKey.toUpperCase(), Math.max(0, toFinite(row.actualWeightPct, 0))] as const),
  );
  const sellDeltaByAssetKey = new Map<string, number>();
  for (const proposal of selectedProposals) {
    const assetKey = proposal.assetKey.toUpperCase();
    const delta = proposal.side === "SELL" ? -Math.max(0, toFinite(proposal.suggestedNotional, 0)) : Math.max(0, toFinite(proposal.suggestedNotional, 0));
    sellDeltaByAssetKey.set(assetKey, (sellDeltaByAssetKey.get(assetKey) || 0) + delta);
  }

  return Array.from(sellDeltaByAssetKey.entries()).some(([assetKey, delta]) => {
    if (!(delta < 0)) return false;
    const currentWeightPct = actualWeightPctByAssetKey.get(assetKey) || 0;
    if (!(currentWeightPct > maxPositionLimitPct)) return false;
    const currentValue = currentValueByAssetKey.get(assetKey) || 0;
    const nextValue = Math.max(0, currentValue + delta);
    const nextWeightPct = (nextValue / totalEquity) * 100;
    return nextWeightPct < currentWeightPct;
  });
}


export async function generateWorkbenchRebalanceCycle(
  input: GenerateRebalanceCycleInput = {},
): Promise<GenerateRebalanceCycleResult> {
  const triggerSource: RebalanceTriggerSource = input.triggerSource || "manual";
  const manual = input.manual === true || triggerSource === "manual";

  const [rawBootstrap, systemRow, recentCycles] = await Promise.all([
    buildWorkbenchBootstrap({ syncPrices: true }),
    getDaaSystemConfig(),
    listDaaRebalanceCycles(120),
  ]);
  const hasAgentTargetOverrides = Object.keys(input.targetWeightOverrides || {}).length > 0;
  const bootstrap = applyTargetWeightOverridesToBootstrap(rawBootstrap, input.targetWeightOverrides);

  const latestCycle = recentCycles[0] || null;
  const policy = resolvePolicyConfig(systemRow.config);
  const portfolioState = buildPortfolioState(bootstrap);
  const signals = collectPortfolioSignals({
    portfolioState,
    systemConfig: systemRow.config,
    policy,
    marketContext: bootstrap.marketContext,
  });
  const marketContext = bootstrap.marketContext || null;
  const now = new Date();
  let cooldownReferenceCycle: DaaStoreRebalanceCycle | null = latestCycle;
  const skipWithLatest = (message: string, options: {
    skippedByCooldown?: boolean;
    cooldownUntil?: string | null;
    attachLatestCycle?: boolean;
    detailsJson?: Record<string, unknown>;
  } = {}): GenerateRebalanceCycleResult => {
    const attachedCycle = options.attachLatestCycle ? (cooldownReferenceCycle || latestCycle) : null;
    void appendTriggerEventSafe({
      triggerSource,
      triggerReason: message,
      cycleId: attachedCycle?.cycleId || null,
      status: options.skippedByCooldown ? "conflict" : "skipped",
      detailsJson: {
        skippedByCooldown: options.skippedByCooldown === true,
        cooldownUntil: options.cooldownUntil || null,
        ...(options.detailsJson ?? {}),
      },
    });
    return {
      cycle: attachedCycle ? mapStoreCycleToView(attachedCycle) : null,
      created: false,
      skippedByCooldown: options.skippedByCooldown === true,
      cooldownUntil: options.cooldownUntil || null,
      message,
      portfolioStatus: "skipped",
      marketRegime: (attachedCycle ? mapStoreCycleToView(attachedCycle)?.marketContext?.regime : null) || marketContext?.regime || null,
      llmSummary: null,
    };
  };

  if (!manual && triggerSource === "scheduled_review") {
    if (!policy.review.enabled) {
      return skipWithLatest("定期组合复盘未启用，跳过自动生成。");
    }

    if (!isPastUtcTime(now, policy.review.scheduledTimeUtc)) {
      return skipWithLatest(`未到定期复盘窗口（UTC ${policy.review.scheduledTimeUtc}）`);
    }

    const timeZone = normalizeTimeZoneOrUtc(policy.review.timezone);
    const today = getZonedYmd(now, timeZone);
    const dueDay = Math.max(1, Math.min(28, Math.trunc(policy.review.dayOfMonth || 1)));

    // every_3_days 和 weekly 不依赖 dayOfMonth，由 periodKey 去重控制实际间隔
    const isHighFrequency = policy.review.frequency === "every_3_days" || policy.review.frequency === "weekly";
    if (!isHighFrequency && (today.day !== dueDay || !isReviewMonthDue(today.month, policy.review.frequency))) {
      return skipWithLatest(
        `当前不在定期组合复盘窗口（${timeZone} 每${policy.review.frequency === "monthly"
          ? "月"
          : (policy.review.frequency === "quarterly"
            ? "季"
            : (policy.review.frequency === "semi_annual" ? "半年" : "年"))}${dueDay}日）`,
      );
    }

    const currentPeriodKey = buildReviewPeriodKey({
      date: now,
      timeZone,
      frequency: policy.review.frequency,
    });
    const duplicated = recentCycles.some((row) => {
      if (row.triggerSource !== "scheduled_review") return false;
      const ms = Date.parse(row.createdAt || row.snapshotAt);
      if (!Number.isFinite(ms)) return false;
      const rowPeriodKey = buildReviewPeriodKey({
        date: new Date(ms),
        timeZone,
        frequency: policy.review.frequency,
      });
      return rowPeriodKey === currentPeriodKey;
    });
    if (duplicated) {
      return skipWithLatest(`当前周期 ${currentPeriodKey} 已完成定期组合复盘`);
    }
  }

  if (!manual && triggerSource === "drift") {
    if (!policy.drift.enabled) {
      return skipWithLatest("偏移触发未启用，跳过自动生成。");
    }
  }

  const autoExecutionCooldownHours = Math.max(1, policy.throttle.autoExecutionCooldownHours);
  const cooldownMs = autoExecutionCooldownHours * 60 * 60 * 1000;
  const latestAutoComparableCycle = isAutoCooldownGuardTrigger({ triggerSource, manual })
    ? (recentCycles.find((row) => row.triggerSource !== "manual" && row.triggerSource !== "risk") || null)
    : null;
  cooldownReferenceCycle = latestAutoComparableCycle || latestCycle;
  let autoCooldownUntil: string | null = null;
  if (latestAutoComparableCycle && isCycleWithinCooldownWindow({
    cycle: latestAutoComparableCycle,
    cooldownMs,
    nowMs: Date.now(),
  })) {
    const lastMs = Date.parse(latestAutoComparableCycle.createdAt || latestAutoComparableCycle.snapshotAt);
    autoCooldownUntil = Number.isFinite(lastMs) ? toIsoByMs(lastMs + cooldownMs) : null;
  }

  // ── Step A: 计算 drift draft（纯数学，保持不变）─────────────────────
  const draft = buildCycleDraftFromBootstrap({
    bootstrap,
    triggerReason: input.triggerReason,
    allowUnheldBuyTargets: hasAgentTargetOverrides,
  });

  // ── Step A.5: Watchlist 自动建仓（信号达标则为 watchlist 资产生成 BUY 提案） ──
  let watchlistEntryProposals: RebalanceProposal[] = [];
  try {
    const watchlistResult = await generateWatchlistEntryProposals({
      bootstrap,
      systemConfig: systemRow.config,
    });
    watchlistEntryProposals = watchlistResult.proposals;
    if (watchlistEntryProposals.length > 0) {
      // 去重：若该 assetKey 已在 drift 提案中（极少见，holding==0 不会），以 drift 为准
      const existingKeys = new Set(draft.proposals.map((p) => p.assetKey.toUpperCase()));
      watchlistEntryProposals = watchlistEntryProposals.filter(
        (p) => !existingKeys.has(p.assetKey.toUpperCase()),
      );
      draft.proposals.push(...watchlistEntryProposals);
      if (watchlistEntryProposals.length > 0 && !draft.triggerReason.includes("自动建仓")) {
        const extra = `；观察列表自动建仓 ${watchlistEntryProposals.length} 条`;
        draft.triggerReason = (draft.triggerReason || "组合检查") + extra;
      }
    }
  } catch (err) {
    logSwallowed("workbenchRebalanceCycleService.watchlistEntry", err);
  }

  // ── Step B: 现金三层分类 ─────────────────────────────────────────
  const cashClassification = classifyCash({
    totalCash: bootstrap.account.cash,
    frozenCash: bootstrap.account.frozenCash,
    totalEquity: bootstrap.account.totalEquity ?? 0,
    assetUniverse: bootstrap.assetUniverse.map((row) => ({
      holdingQty: row.holdingQty,
      valuationBase: row.valuationBase,
      targetWeightPct: row.targetWeightPct,
      holdingTags: row.holdingTags ?? [],
    })),
    config: {
      operationalReservePct: 0,
      idleThresholdPct: 0.1,
      idleCooldownDays: 7,
    },
    lastDepositAt: null,
  });

  // ── 手动触发 + 无 proposals → 组合健康，返回洞察快照 ─────────────
  // 自动触发场景下（scheduled_review/drift/cash_idle）不返回 healthy，因为空 proposals
  // 意味着已被上面的阈值守卫拦截或通过其他逻辑处理。
  if (draft.proposals.length === 0 && manual) {
    const hasTargetAssets = bootstrap.assetUniverse.some((row) => row.watchEnabled && row.targetWeightPct > 0);
    const hasMeaningfulDrift = draft.maxAbsDriftPct > 0.001;
    const totalEquity = Math.max(0, bootstrap.account.totalEquity ?? 0);
    const hasExecutableTargetPricing = bootstrap.assetUniverse.some((row) => (
      row.watchEnabled
      && row.targetWeightPct > 0
      && !row.fxMissing
      && (row.lastPrice > 0 || row.holdingPrice > 0)
    ));

    if (hasMeaningfulDrift && hasTargetAssets && totalEquity <= 0) {
      return skipWithLatest("当前组合尚未建立可计算权益，请先入金或校准持仓后再生成建议。");
    }

    if (hasMeaningfulDrift && hasTargetAssets && !hasExecutableTargetPricing) {
      return skipWithLatest("目标资产缺少可执行价格或汇率，请先刷新行情 / FX 后再生成建议。");
    }

    const guardlessDraft = hasMeaningfulDrift
      ? buildCycleDraftFromBootstrap({
        bootstrap: {
          ...bootstrap,
          execution: {
            ...bootstrap.execution,
            feeRateBps: 0,
            slippageBps: 0,
            minNotional: 0,
          },
        },
      })
      : null;
    const blockedByTradeGuards = (guardlessDraft?.proposals.length ?? 0) > 0;
    if (blockedByTradeGuards) {
      return skipWithLatest(
        `当前最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}%，但未达到最小成交额或费用门槛，暂不调仓。`,
      );
    }

    // 尝试获取信号洞察（非阻断，失败则返回空快照）
    let healthyInsight: PortfolioHealthyInsight = {
      maxDriftPct: draft.maxAbsDriftPct,
      topOpportunities: [],
      llmSummary: null,
      cashIdleWarning: cashClassification.cashIdleWarning,
      cashIdlePct: cashClassification.investableIdlePct,
      generatedAt: new Date().toISOString(),
    };

    try {
      // Agent 模式：从最近的 Agent 运行获取摘要
      const { getLatestRun } = await import("@/src/daa/agent/store/agentRunStore");
      const latestRun = await getLatestRun();
      const { getActiveTheses } = await import("@/src/daa/agent/store/thesisStore");
      const theses = await getActiveTheses();

      healthyInsight = {
        maxDriftPct: draft.maxAbsDriftPct,
        topOpportunities: theses.slice(0, 5).map(t => ({
          symbol: parseDaaAssetKey(t.assetKeys[0])?.symbol ?? t.title,
          action: t.conviction === "high" ? "open_or_add" as const : "watch" as const,
          finalScorePct: t.conviction === "high" ? 80 : t.conviction === "medium" ? 60 : 30,
          confidencePct: t.conviction === "high" ? 85 : 55,
        })),
        llmSummary: latestRun?.briefing
          ? `Agent: ${(latestRun.briefing as unknown as Record<string, unknown>)?.thesesUpdated ?? 0} 论点更新, ${theses.length} 活跃`
          : `${theses.length} 个活跃研究论点`,
        cashIdleWarning: cashClassification.cashIdleWarning,
        cashIdlePct: cashClassification.investableIdlePct,
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      logSwallowed("workbenchRebalanceCycleService.loadInsight", err);
    }

    void appendTriggerEventSafe({
      triggerSource,
      triggerReason: `组合已接近目标，最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}%，无需调仓`,
      cycleId: null,
      status: "skipped",
      detailsJson: { reason: "portfolio_healthy", maxDriftPct: draft.maxAbsDriftPct },
    });

    return {
      cycle: null,
      created: false,
      skippedByCooldown: false,
      cooldownUntil: null,
      message: `组合已处于目标配置，最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}%，无需调仓`,
      portfolioStatus: "healthy",
      healthyInsight,
      marketRegime: marketContext?.regime || null,
      llmSummary: healthyInsight.llmSummary,
    };
  }

  // ── Step B-E: Cognitive Agent 驱动调仓 ──
  // Agent thesis conviction → 提案量调整
  const agentResult = hasAgentTargetOverrides && triggerSource === "agent_trigger"
    ? {
      proposals: draft.proposals,
      llmSummary: `Agent 目标权重计划已进入执行层，生成 ${draft.proposals.length} 个 BUY/SELL 提案。`,
      marketRegime: marketContext?.regime ?? null,
      agentStatus: "ok" as const,
      tokensUsed: 0,
    }
    : await enhanceProposalsWithAgent({
      draftProposals: draft.proposals,
      marketRegime: marketContext?.regime ?? null,
      totalEquity: bootstrap.account.totalEquity ?? 0,
      maxPositionPct: systemRow.config.strategy.constraints.maxPositionPct,
    });

  draft.proposals = agentResult.proposals;
  if (hasAgentTargetOverrides && triggerSource === "agent_trigger") {
    draft.proposals = relabelAgentEntryProposals({ proposals: draft.proposals, bootstrap });
  }

  // ── Step E.5: Tax-Loss Harvesting 扫描 ────────────────────────────
  let tlhProposals: RebalanceProposal[] = [];
  try {
    const tlhResult = await scanTaxLossHarvestingCandidates({ bootstrap });
    if (tlhResult.proposals.length > 0) {
      const existingSellKeys = new Set(
        draft.proposals.filter((p) => p.side === "SELL").map((p) => p.assetKey.toUpperCase()),
      );
      tlhProposals = tlhResult.proposals.filter(
        (p) => !existingSellKeys.has(p.assetKey.toUpperCase()),
      );
    }
  } catch (err) {
    logSwallowed("workbenchRebalanceCycleService.tlhScan", err);
  }

  let mergedProposals = filterSmallCycleProposals({
    proposals: [...draft.proposals, ...tlhProposals],
    minNotionalBase: systemRow.config.strategy.constraints.minNotional,
  });
  const isAgentPureRiskReduction = triggerSource === "agent_trigger" && isPureRiskReductionAgentCycle({
    bootstrap,
    proposals: mergedProposals,
    maxPositionPct: systemRow.config.strategy.constraints.maxPositionPct,
  });
  const isAgentTargetWeightCycle = triggerSource === "agent_trigger" && hasAgentTargetOverrides;
  const recentExecutedTrades = !manual && triggerSource !== "risk"
    ? await listDaaTradeTickets({ status: "executed", limit: 300 })
    : [];
  const shouldApplyAutoTradeStabilityGuard = !manual && triggerSource !== "risk" && !isAgentPureRiskReduction;
  const agentStabilityGuard = shouldApplyAutoTradeStabilityGuard
    ? filterAutoTradeStability({
      proposals: mergedProposals,
      recentTrades: recentExecutedTrades,
      totalEquity: bootstrap.account.totalEquity ?? systemRow.config.strategy.account.totalEquity ?? 0,
      currentTargetWeightPctByAssetKey: Object.fromEntries(
        rawBootstrap.assetUniverse.map((row) => {
          const assetKey = row.assetKey.toUpperCase();
          const baselineTargetWeight = input.targetWeightBaseline?.[assetKey];
          return [
            assetKey,
            baselineTargetWeight == null
              ? Math.max(0, toFinite(row.targetWeightPct, 0))
              : Math.max(0, Math.min(1, toFinite(baselineTargetWeight, 0))) * 100,
          ];
        }),
      ),
    })
    : { proposals: mergedProposals, blocked: [] };
  mergedProposals = agentStabilityGuard.proposals;
  if (agentStabilityGuard.blocked.length > 0 && mergedProposals.length === 0) {
    return skipWithLatest(
      `${isAgentTargetWeightCycle ? "Agent" : "自动"}交易稳定器已跳过本轮全部下单：${agentStabilityGuard.blocked.map((row) => row.blockedReason).join("；")}`,
      { attachLatestCycle: true },
    );
  }
  const reversalGuard = !manual && triggerSource !== "risk" && !isAgentPureRiskReduction && !isAgentTargetWeightCycle
    ? filterRecentAutoTradeReversals({
      proposals: mergedProposals,
      recentTrades: recentExecutedTrades,
    })
    : { proposals: mergedProposals, blocked: [] };
  mergedProposals = reversalGuard.proposals;
  if (reversalGuard.blocked.length > 0 && mergedProposals.length === 0) {
    return skipWithLatest(
      `自动调仓反向交易冷却中：${reversalGuard.blocked.map((row) => row.blockedReason).join("；")}`,
      { attachLatestCycle: true },
    );
  }
  const intents = buildInvestmentIntents({
    triggerSource,
    triggerReason: draft.triggerReason,
    signals,
    manual,
    hasAgentTargetOverrides,
  });
  const policyDecision = evaluatePortfolioPolicy({
    portfolioState,
    policy,
    signals,
    intents,
    proposals: mergedProposals,
    triggerSource,
    manual,
    latestAutoComparableCycle,
  });
  const policySnapshot = {
    decision: policyDecision,
    intentIds: intents.map((intent) => intent.intentId),
    signalIds: signals.map((signal) => signal.signalId),
  };
  if (policy.enabled && !policy.shadowMode && (policyDecision.action === "ignore" || policyDecision.action === "observe")) {
    const reason = policyDecision.blockers[0] || policyDecision.reasons[0] || "策略引擎判断无需行动";
    return skipWithLatest(`策略引擎保持观察：${reason}`, {
      attachLatestCycle: true,
      skippedByCooldown: policyDecision.noTradeBandState === "cooling",
      cooldownUntil: policyDecision.noTradeBandState === "cooling" ? autoCooldownUntil : null,
      detailsJson: {
        policyDecisionId: policyDecision.decisionId,
        policyAction: policyDecision.action,
        policyScore: policyDecision.score,
        policyThreshold: policyDecision.threshold,
        noTradeBandState: policyDecision.noTradeBandState,
        blockers: policyDecision.blockers,
        reasons: policyDecision.reasons,
        signalIds: policySnapshot.signalIds.slice(0, 30),
        intentIds: policySnapshot.intentIds,
      },
    });
  }
  const emptyAutoTriggerSkipMessage = buildEmptyAutoTriggerSkipMessage({
    triggerSource,
    manual,
    proposalCount: mergedProposals.length,
    agentSummary: agentResult.llmSummary,
  });
  if (emptyAutoTriggerSkipMessage) {
    return skipWithLatest(emptyAutoTriggerSkipMessage);
  }

  // ── Step F: 风险检查 ──────────────────────────────────────────────
  const baseRiskCheck = buildPreTradeRiskCheckFromBootstrap({
    bootstrap,
    systemConfig: systemRow.config,
    proposals: mergedProposals.filter((p) => p.selected),
  });
  const riskCheck = await enrichRiskCheckWithCorrelation(
    baseRiskCheck,
    bootstrap.assetUniverse,
    systemRow.config.strategy.risk.correlationCapPct,
  );
  const proposalPlan = buildProposalPlan({
    policyDecision,
    proposals: mergedProposals,
    systemConfig: systemRow.config,
  });

  // ── Step G: 创建 Cycle ────────────────────────────────────────────
  const cycleNotes = [
    `Policy(${policyDecision.action}): score ${policyDecision.score.toFixed(1)} / threshold ${policyDecision.threshold.toFixed(1)} · ${policyDecision.noTradeBandState}`,
    policyDecision.blockers.length > 0 ? `策略阻断: ${policyDecision.blockers.join("；").slice(0, 240)}` : null,
    policyDecision.reasons.length > 0 ? `策略理由: ${policyDecision.reasons.join("；").slice(0, 240)}` : null,
    `Agent(${agentResult.agentStatus}): ${agentResult.proposals.length} 个提案`,
    marketContext ? `市场环境: ${marketRegimeLabelZh(marketContext.regime)} / 风险分 ${marketContext.riskOffScorePct.toFixed(1)}` : null,
    agentResult.llmSummary ? `Agent摘要: ${agentResult.llmSummary.slice(0, 120)}` : null,
    reversalGuard.blocked.length > 0
      ? `反向交易冷却: ${reversalGuard.blocked.map((row) => row.blockedReason).join("；").slice(0, 240)}`
      : null,
    agentStabilityGuard.blocked.length > 0
      ? `${isAgentTargetWeightCycle ? "Agent" : "自动"}交易稳定器: ${agentStabilityGuard.blocked.map((row) => row.blockedReason).join("；").slice(0, 240)}`
      : null,
    cashClassification.cashIdleWarning
      ? `现金提示: 闲置资金 ${(cashClassification.investableIdlePct * 100).toFixed(1)}%（已${cashClassification.cashIdleDays}天）`
      : null,
    tlhProposals.length > 0
      ? `税务收割: ${tlhProposals.length} 条建议`
      : null,
  ].filter(Boolean).join("\n");

  const normalizedAgentTargetWeightOverrides = normalizeTargetWeightOverridesSnapshot(input.targetWeightOverrides);
  const agentDecisionSnapshot: Record<string, unknown> | null = {
    status: agentResult.agentStatus,
    summary: agentResult.llmSummary,
    marketRegime: agentResult.marketRegime,
    tokensUsed: agentResult.tokensUsed,
    targetWeightOverrides: normalizedAgentTargetWeightOverrides,
    targetWeightBaseline: normalizeTargetWeightOverridesSnapshot(input.targetWeightBaseline),
    targetWeightLifecycle: normalizedAgentTargetWeightOverrides
      ? (systemRow.config.watchlistEntry?.aiTargetWeightPool.enabled
        ? "persisted_to_watchlist_target_pool"
        : "persist_after_successful_execution")
      : null,
  };

  const created = await createDaaRebalanceCycle({
    triggerSource,
    triggerReason: draft.triggerReason,
    snapshotAt: new Date().toISOString(),
    equitySnapshot: Math.max(0, toFinite(bootstrap.account.totalEquity, 0)),
    driftSnapshot: draft.driftSnapshot,
    proposals: mergedProposals,
    riskCheck,
    notes: cycleNotes || null,
    marketContext,
    agentDecisionSnapshot,
    policyDecisionId: policyDecision.decisionId,
    intentIds: policySnapshot.intentIds,
    signalIds: policySnapshot.signalIds,
    policySnapshot,
    proposalPlanId: proposalPlan.planId,
  });

  await appendTriggerEventSafe({
    triggerSource,
    triggerReason: draft.triggerReason,
    cycleId: created.cycleId,
    status: "accepted",
    detailsJson: {
      proposalCount: mergedProposals.length,
      tlhProposalCount: tlhProposals.length,
      riskOverallStatus: riskCheck.overallStatus,
      agentStatus: agentResult.agentStatus,
      policyDecisionId: policyDecision.decisionId,
      policyAction: policyDecision.action,
      policyScore: policyDecision.score,
      noTradeBandState: policyDecision.noTradeBandState,
      proposalPlanId: proposalPlan.planId,
      proposalPlanCostBase: proposalPlan.estimatedCostBase,
      ruleBasedMarketRegime: marketContext?.regime || null,
      cashIdleWarning: cashClassification.cashIdleWarning,
    },
  });

  return {
    cycle: mapStoreCycleToView(created),
    created: true,
    skippedByCooldown: false,
    cooldownUntil: null,
    message: `已生成再平衡周期 ${created.cycleId}`,
    portfolioStatus: "needs_rebalance",
    marketRegime: agentResult.marketRegime || marketContext?.regime || null,
    llmSummary: agentResult.llmSummary,
  };
}
export async function updateWorkbenchRebalanceCycle(
  cycleId: string,
  input: UpdateRebalanceCycleInput,
): Promise<RebalanceCycle> {
  const current = await getDaaRebalanceCycle(cycleId);
  if (!current) throw new Error(`cycle not found: ${cycleId}`);
  assertCycleMutable(current);

  let proposals = current.proposals;
  let nextRiskCheck = current.riskCheck;
  const hasAssetSideKeys = Array.isArray(input.selectedAssetSideKeys);
  if (hasAssetSideKeys) {
    const selectedSet = new Set(
      (input.selectedAssetSideKeys ?? []).map((k) => k.trim().toUpperCase()).filter(Boolean),
    );
    proposals = proposals.map((row) => ({
      ...row,
      selected: selectedSet.has(`${row.assetKey.toUpperCase()}::${row.side.toUpperCase()}`),
    }));

    const [bootstrap, systemRow] = await Promise.all([
      buildWorkbenchBootstrap({ syncPrices: false }),
      getDaaSystemConfig(),
    ]);
    const baseRiskCheck = buildPreTradeRiskCheckFromBootstrap({
      bootstrap,
      systemConfig: systemRow.config,
      proposals: proposals.filter((row) => row.selected),
    });
    nextRiskCheck = await enrichRiskCheckWithCorrelation(
      baseRiskCheck,
      bootstrap.assetUniverse,
      systemRow.config.strategy.risk.correlationCapPct,
    );
  }

  const patchInput: Parameters<typeof patchDaaRebalanceCycle>[0] = {
    cycleId,
    proposals,
    riskCheck: nextRiskCheck,
    notes: input.notes === undefined ? current.notes : input.notes,
  };
  if (input.status === "reviewing") {
    patchInput.status = "reviewing";
  }
  if (input.cancel) {
    patchInput.status = "cancelled";
    patchInput.cancelledAt = new Date().toISOString();
    patchInput.cancelReason = normalizeText(input.cancel.reason) || "用户取消";
  }

  const patched = await patchDaaRebalanceCycle(patchInput);
  const mapped = mapStoreCycleToView(patched);
  if (!mapped) throw new Error("cycle update failed");
  return mapped;
}

function normalizeExecutionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "broker_order_failed");
}

async function executeWorkbenchProposalByRoute(input: {
  cycleId: string;
  row: {
    assetKey: string;
    symbol: string;
    currency: string;
    side: "BUY" | "SELL";
    suggestedQty: number;
    price: number;
    reason: string;
  };
  feeRate: number;
  assetMeta?: {
    market: string;
    assetClass: string;
    instrumentType: string;
    marketGroup: string;
  } | null;
}): Promise<string | null> {
  if (!(input.row.price > 0) || !(input.row.suggestedQty > 0)) return null;

  const parsed = parseDaaAssetKey(input.row.assetKey);
  const market = parsed?.market || "US";
  const fee = Math.max(0, input.row.suggestedQty * input.row.price * input.feeRate);
  const route = await resolveExecutionRoute({
    assetKey: input.row.assetKey,
    symbol: input.row.symbol,
    market,
    currency: input.row.currency,
    assetClass: input.assetMeta?.assetClass || null,
    instrumentType: input.assetMeta?.instrumentType || null,
    marketGroup: input.assetMeta?.marketGroup || null,
  });

  const localTicket = await createDaaTradeTicket({
    source: "decision",
    cycleId: input.cycleId,
    assetKey: input.row.assetKey,
    symbol: input.row.symbol,
    market,
    instrumentCurrency: normalizeDaaCurrencyCode(input.row.currency, "USD"),
    side: input.row.side,
    qty: input.row.suggestedQty,
    price: input.row.price,
    fee,
    pricingMode: "market",
    priceSource: "rebalance_cycle",
    decisionRefId: input.cycleId,
    reasonText: input.row.reason,
    reasonTags: ["rebalance_cycle"],
    brokerKind: route.kind,
    brokerAccountId: route.remote ? null : route.kind,
    brokerOrderId: null,
    brokerStatus: route.remote ? null : "ready",
    createdBy: "workbench.rebalance",
  });

  if (!route.remote) {
    await executeDaaTradeTickets({ ticketIds: [localTicket.ticketId] });
    return localTicket.ticketId;
  }

  try {
    const placed = await route.adapter.placeOrder({
      assetKey: input.row.assetKey,
      symbol: input.row.symbol,
      market,
      currency: normalizeDaaCurrencyCode(input.row.currency, "USD"),
      side: input.row.side,
      qty: input.row.suggestedQty,
      orderType: "MKT",
      referencePrice: input.row.price,
      limitPrice: null,
      reasonText: input.row.reason,
      tags: ["rebalance_cycle"],
      createdBy: "workbench.rebalance",
    });

    await applyDaaBrokerOrderSync({
      ticketId: localTicket.ticketId,
      order: {
        broker: route.kind,
        accountId: placed.order.accountId,
        orderId: placed.order.orderId,
        status: placed.order.status,
        filledQty: placed.order.filledQty,
        avgFillPrice: placed.order.avgFillPrice,
        updatedAt: placed.order.updatedAt,
        raw: placed.order.raw,
      },
    });

    try {
      await syncBrokerOrders({
        scope: "ticket",
        ticketId: localTicket.ticketId,
        limit: 50,
      });
    } catch (err) {
      logSwallowed("workbenchRebalanceCycleService.syncBrokerOrders", err);
    }

    return localTicket.ticketId;
  } catch (error) {
    const message = normalizeExecutionErrorMessage(error);
    await applyDaaBrokerOrderSync({
      ticketId: localTicket.ticketId,
      order: {
        broker: route.kind,
        accountId: "",
        orderId: "",
        status: "Rejected",
        filledQty: null,
        avgFillPrice: null,
        updatedAt: new Date().toISOString(),
        raw: { text: message, message },
      },
    });
    return localTicket.ticketId;
  }
}

export async function executeWorkbenchRebalanceCycle(input: {
  cycleId: string;
  executeMode: RebalanceExecuteMode;
}): Promise<ExecuteRebalanceCycleResult> {
  const cycle = await getDaaRebalanceCycle(input.cycleId);
  if (!cycle) throw new Error(`cycle not found: ${input.cycleId}`);

  // ── Stuck-cycle recovery: reset cycles stuck in "executing" for > 5 min ──
  if (cycle.status === "executing" && !cycle.executedAt) {
    const executionStartedMs = Date.parse(cycle.executionStartedAt || "");
    const stuckThresholdMs = 5 * 60 * 1000;
    if (Number.isFinite(executionStartedMs) && Date.now() - executionStartedMs > stuckThresholdMs) {
      console.warn(`[DAA] Recovering stuck cycle ${input.cycleId}: resetting executing → reviewing`);
      await patchDaaRebalanceCycle({
        cycleId: input.cycleId,
        status: "reviewing",
        executionStartedAt: null,
        notes: `${cycle.notes || ""}\n[系统恢复] 执行中断超时，已自动重置为审阅状态`.trim(),
      });
      // Re-fetch after recovery
      const recovered = await getDaaRebalanceCycle(input.cycleId);
      if (!recovered) throw new Error(`cycle not found after recovery: ${input.cycleId}`);
      Object.assign(cycle, recovered);
    }
  }

  assertCycleExecutable(cycle, "execute");

  const toExecute = cycle.proposals.filter((row) => input.executeMode === "all" || row.selected);
  if (!toExecute.length) {
    const reviewed = await patchDaaRebalanceCycle({
      cycleId: input.cycleId,
      status: "reviewing",
    });
    return {
      cycle: mapStoreCycleToView(reviewed)!,
      logs: [],
    };
  }

  const [preTradeRiskCheck, systemRow, beforeBootstrap] = await Promise.all([
    validateExecutionRisk({
      cycleId: input.cycleId,
      selectedAssetSideKeys: toExecute.map((row) => `${row.assetKey}::${row.side}`),
    }),
    getDaaSystemConfig(),
    buildWorkbenchBootstrap({ syncPrices: false }),
  ]);
  const enforceOnExecution = systemRow.config.strategy.risk.enforceOnExecution !== false;
  const feeRateBps = getStrategyExecutionConfig(systemRow.config).feeRateBps;
  const feeRate = feeRateBps / 10000;
  if (enforceOnExecution && preTradeRiskCheck.overallStatus === "block") {
    await patchDaaRebalanceCycle({
      cycleId: input.cycleId,
      status: "reviewing",
      riskCheck: preTradeRiskCheck,
    });
    const blockedItem = preTradeRiskCheck.items.find((item) => item.status === "block");
    throw new Error(`RISK_BLOCKED:${JSON.stringify({
      code: "RISK_BLOCKED",
      rule: blockedItem?.rule || "unknown",
      message: blockedItem?.message || "执行前风控阻断",
      current: blockedItem?.current ?? null,
      limit: blockedItem?.limit ?? null,
    })}`);
  }

  await patchDaaRebalanceCycle({
    cycleId: input.cycleId,
    status: "executing",
    riskCheck: preTradeRiskCheck,
  });

  // ── Refresh prices before execution to avoid stale-price losses ──
  const executionConfig = getStrategyExecutionConfig(systemRow.config);
  const slippageRate = executionConfig.slippageBps / 10_000;

  const refreshedPrices = await getMarketPricesWithCache({
    assets: toExecute.map((row) => ({
      symbol: row.symbol,
      market: parseDaaAssetKey(row.assetKey)?.market || "US",
      currency: row.currency,
    })),
    allowRefresh: true,
    forceRefresh: true,
    refreshBudget: toExecute.length,
    timeoutMs: 5000,
    source: "rebalance_execution",
    freshSec: 120,
    serveStaleSec: 3600,
    rawRetentionDays: 90,
  });

  // Build execution-ready proposals with refreshed prices + slippage
  const executionRows = toExecute.map((row) => {
    const parsed = parseDaaAssetKey(row.assetKey);
    const priceKey = `${parsed?.market || "US"}::${row.symbol}`.toUpperCase();
    const refreshed = refreshedPrices[priceKey];
    const basePrice = (refreshed && refreshed.price > 0) ? refreshed.price : row.price;
    // Apply slippage: BUY pays more, SELL receives less
    const slippageMultiplier = row.side === "BUY" ? (1 + slippageRate) : (1 - slippageRate);
    const executionPrice = basePrice * slippageMultiplier;
    return {
      ...row,
      price: executionPrice,
      _originalPrice: row.price,
      _refreshedPrice: basePrice,
      _slippageApplied: slippageRate > 0,
    };
  });

  const assetMetaByKey = new Map(
    beforeBootstrap.assetUniverse.map((row) => [row.assetKey, row]),
  );
  const createdTicketIds: string[] = [];
  for (const row of executionRows) {
    const ticketId = await executeWorkbenchProposalByRoute({
      cycleId: input.cycleId,
      row,
      feeRate,
      assetMeta: assetMetaByKey.get(row.assetKey)
        ? {
          market: assetMetaByKey.get(row.assetKey)!.market,
          assetClass: assetMetaByKey.get(row.assetKey)!.assetClass,
          instrumentType: assetMetaByKey.get(row.assetKey)!.instrumentType,
          marketGroup: assetMetaByKey.get(row.assetKey)!.marketGroup,
        }
        : null,
    });
    if (ticketId) createdTicketIds.push(ticketId);
  }

  const logs = await listDaaTradeTickets({ limit: 300 });
  const cycleLogs = logs.filter((row) => createdTicketIds.includes(row.ticketId));
  const persistedTargetCount = await persistExecutedTargetWeights({
    cycle,
    cycleLogs,
  });
  const watchlistEntryKeys = new Set(
    executionRows
      .filter((row) => (row as RebalanceProposal).proposalType === "watchlist_entry")
      .map((row) => row.assetKey.toUpperCase()),
  );
  const executedWatchlistEntryKeys = new Set(
    cycleLogs
      .filter((row) => row.status === "executed" && watchlistEntryKeys.has(row.assetKey.toUpperCase()))
      .map((row) => row.assetKey),
  );
  if (executedWatchlistEntryKeys.size > 0) {
    await Promise.all(
      [...executedWatchlistEntryKeys].map((assetKey) =>
        markWatchlistEntryTriggered(assetKey).catch((err) =>
          logSwallowed("workbenchRebalanceCycleService.markWatchlistTriggered", err),
        ),
      ),
    );
  }

  // P0: 交易结果反馈 → thesis evidence 闭环（按 assetKey 匹配活跃 thesis）
  try {
    const activeTheses = await getActiveTheses();
    const thesisByAsset = new Map<string, string[]>();
    for (const t of activeTheses) {
      for (const ak of t.assetKeys) {
        const existing = thesisByAsset.get(ak) ?? [];
        existing.push(t.id);
        thesisByAsset.set(ak, existing);
      }
    }
    for (const log of cycleLogs.filter((r) => r.status === "executed")) {
      const tids = thesisByAsset.get(log.assetKey);
      if (tids) {
        for (const tid of tids) {
          recordTradeOutcomeAsEvidence({
            thesisId: tid,
            assetKey: log.assetKey,
            side: log.side as "BUY" | "SELL",
            entryPrice: log.price,
            currentPrice: log.price,
            realizedPnlPct: null,
          }).catch((e) => logSwallowed("rebalanceCycle.feedbackLoop", e));
        }
      }
    }
  } catch (e) {
    logSwallowed("rebalanceCycle.feedbackLoop.init", e);
  }

  const executedCount = cycleLogs.filter((row) => row.status === "executed").length;
  const submittedCount = cycleLogs.filter((row) => row.status === "submitted" || row.status === "partially_filled").length;
  const failedCount = cycleLogs.filter((row) => row.status === "rejected" || row.status === "canceled").length;
  const totalNotional = executionRows.reduce((sum, row) => {
    const fxRateToBase = Math.max(0, toFinite(row.fxRateToBase, 0));
    const grossNotional = Math.max(0, toFinite(row.suggestedQty, 0)) * Math.max(0, toFinite(row.price, 0));
    return sum + (fxRateToBase > 0 ? grossNotional * fxRateToBase : 0);
  }, 0);
  const newMaxDriftPct = cycle.driftSnapshot.reduce((max, row) => Math.max(max, Math.abs(row.driftPct * 100)), 0);

  const priceAdjustmentNotes = executionRows
    .filter((row) => row._refreshedPrice !== row._originalPrice || row._slippageApplied)
    .map((row) => `${row.symbol}: 原价${row._originalPrice.toFixed(2)} → 刷新${row._refreshedPrice.toFixed(2)} → 执行${row.price.toFixed(2)}${row._slippageApplied ? ` (滑点${(slippageRate * 10000).toFixed(0)}bps)` : ""}`)
    .slice(0, 10);
  const executionNotes = priceAdjustmentNotes.length > 0
    ? `\n[执行价格] ${priceAdjustmentNotes.join(" | ")}`
    : "";
  const targetWeightNotes = persistedTargetCount > 0
    ? `\n[目标权重] 已将 ${persistedTargetCount} 个已成交标的的目标权重写入持久目标，避免后续 drift 反向卖出。`
    : "";
  const hasOpenOrders = submittedCount > 0;

  const completed = await patchDaaRebalanceCycle({
    cycleId: input.cycleId,
    status: hasOpenOrders ? "executing" : "completed",
    executedAt: hasOpenOrders ? null : new Date().toISOString(),
    executedOrders: createdTicketIds,
    executionSummary: {
      ordersExecuted: executedCount,
      ordersSubmitted: submittedCount,
      ordersFailed: failedCount,
      totalNotional,
      newMaxDriftPct,
    },
    notes: (cycle.notes || "") + executionNotes + targetWeightNotes || null,
  });

  if (hasOpenOrders) {
    return {
      cycle: mapStoreCycleToView(completed)!,
      logs: cycleLogs.filter((row) => row.status !== "ready").slice(0, 200),
    };
  }

  const afterBootstrap = await buildWorkbenchBootstrap({ syncPrices: false });

  try {
    const beforeSnapshot = toCycleReportSnapshot(beforeBootstrap);
    const afterSnapshot = toCycleReportSnapshot(afterBootstrap);
    const feeTotal = cycleLogs
      .filter((row) => row.status === "executed")
      .reduce((sum, row) => sum + Math.max(0, row.fee), 0);

    const beforeBySymbol = new Map(beforeBootstrap.assetUniverse.map((row) => [row.symbol.toUpperCase(), row]));
    const realizedBySymbol = new Map<string, number>();
    for (const row of cycleLogs) {
      if (row.status !== "executed" || row.side !== "SELL") continue;
      const before = beforeBySymbol.get(row.symbol.toUpperCase());
      if (!before) continue;
      const costPerUnit = calcHoldingCostPerUnit(before);
      const fx = before.fxRateToBase && before.fxRateToBase > 0 ? before.fxRateToBase : 1;
      const pnl = (row.price - costPerUnit) * row.qty * fx;
      realizedBySymbol.set(row.symbol, (realizedBySymbol.get(row.symbol) || 0) + pnl);
    }
    let unrealizedPnl = 0;
    for (const row of afterBootstrap.assetUniverse) {
      if (!(row.holdingQty > 0)) continue;
      const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
      const costPerUnit = calcHoldingCostPerUnit(row);
      const fx = row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : 1;
      unrealizedPnl += (px - costPerUnit) * row.holdingQty * fx;
    }
    const topContributors = [...realizedBySymbol.entries()]
      .map(([symbol, pnl]) => ({ symbol, pnl, side: "SELL" as const }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 5);
    const realizedPnl = [...realizedBySymbol.values()].reduce((sum, value) => sum + value, 0);

    await upsertDaaCycleReport({
      cycleId: input.cycleId,
      beforeSnapshot,
      afterSnapshot,
      executionStats: {
        ordersExecuted: executedCount,
        ordersSubmitted: submittedCount,
        ordersFailed: failedCount,
        totalNotional,
        newMaxDriftPct,
        feeTotal,
      },
      pnlAttribution: {
        realizedPnl,
        unrealizedPnl,
        feeTotal,
        fxImpact: 0,
        topContributors,
      },
      riskDelta: {
        maxDrawdownBefore: beforeSnapshot.maxDrawdownPct,
        maxDrawdownAfter: afterSnapshot.maxDrawdownPct,
        hhiBefore: beforeSnapshot.hhiPct,
        hhiAfter: afterSnapshot.hhiPct,
        maxWeightBefore: beforeSnapshot.maxWeightPct,
        maxWeightAfter: afterSnapshot.maxWeightPct,
        maxDriftBefore: beforeSnapshot.maxDriftPct,
        maxDriftAfter: afterSnapshot.maxDriftPct,
      },
    });
  } catch (reportError) {
    console.error(`[DAA] Cycle report generation failed for ${input.cycleId}:`, reportError);
    // Record failure in cycle notes for audit trail
    void patchDaaRebalanceCycle({
      cycleId: input.cycleId,
      notes: `${cycle.notes || ""}\n[复盘报告] 生成失败: ${reportError instanceof Error ? reportError.message : String(reportError)}`.trim(),
    }).catch((err) => { logSwallowed("workbenchRebalanceCycleService.patchNotes", err); });
  }

  return {
    cycle: mapStoreCycleToView(completed)!,
    logs: cycleLogs.filter((row) => row.status !== "ready").slice(0, 200),
  };
}
