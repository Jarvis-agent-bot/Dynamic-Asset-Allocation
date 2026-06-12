import { bootstrapTheses, ensureAssetThesisCoverage, type BootstrapAsset } from "@/src/daa/agent/bootstrap";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import type { AgentStrategyOverlay } from "@/src/daa/agent/cognitiveTypes";
import { getAgentStrategyOverlayForRun } from "@/src/daa/agent/store/overlayStore";
import { attachCycleToAgentDecisionAudits } from "@/src/daa/agent/store/agentDecisionAuditStore";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import { resolveBrainConfig } from "@/src/daa/brain/brainPolicy";
import { evaluateBrainActionAuthority, type AutomationAuthorityTrigger } from "@/src/daa/automation/automationAuthority";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";
import type { RebalanceTriggerSource } from "@/src/daa/modules/rebalance/rebalanceTypes";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { buildTargetWeightSuggestionPlan } from "@/src/daa/automation/automationGuards";
import {
  persistTargetWeightSuggestionPool,
  resolveTargetWeightSuggestionPoolConfig,
} from "@/src/daa/automation/targetWeightSuggestionPool";
import { executeAutoRebalanceCycle } from "@/src/daa/automation/autoRebalanceExecution";
import {
  getDaaSystemConfig,
  listDaaAssetUniverse,
} from "@/src/daa/store/daaStorePg";
import type { DaaStoreSystemConfigRow } from "@/src/daa/store/storeTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type AutopilotEventSource =
  | "cron_cognitive_agent"
  | "cron_news_refresh"
  | "alpaca_ws_realtime"
  | "manual"
  | "system";

type AutopilotLoopResult = {
  skipped: boolean;
  reason: string | null;
  source: AutopilotEventSource;
  brainMode: string;
  bootstrapped: { attempted: boolean; created: number; errors: string[] };
  cognitiveRun: {
    attempted: boolean;
    runId: string | null;
    thesesUpdated: number;
    surprisesCount: number;
    totalTokens: number;
    durationMs: number;
    errors: string[];
  };
  rebalance: {
    attempted: boolean;
    created: boolean;
    cycleId: string | null;
    proposalCount: number;
    autoExecute: {
      attempted: boolean;
      executed: boolean;
      ordersCount: number;
      blockedReason: string | null;
      error: string | null;
    };
    reason: string | null;
  };
  targetWeightPool: {
    attempted: boolean;
    enabled: boolean;
    targetPlanAvailable: boolean;
    acceptedCount: number;
    skippedCount: number;
    attemptedCount: number;
    persistedCount: number;
    failedCount: number;
    minConfidence: number;
    reason: string | null;
  };
};

type RunAutopilotLoopInput = {
  source: AutopilotEventSource;
  reason: string;
  affectedSymbols?: string[];
};

export function resolveAutopilotRebalanceTriggerSource(source: AutopilotEventSource): RebalanceTriggerSource {
  return source === "cron_cognitive_agent" ? "scheduled_review" : "agent_trigger";
}

export function resolveAutopilotExecutionTriggerSource(source: AutopilotEventSource): AutomationAuthorityTrigger {
  return source === "cron_cognitive_agent" ? "cron_cognitive_agent" : "agent_trigger";
}

function buildSkippedResult(input: {
  source: AutopilotEventSource;
  brainMode: string;
  reason: string;
  config?: DaaSystemConfig;
}): AutopilotLoopResult {
  return {
    skipped: true,
    reason: input.reason,
    source: input.source,
    brainMode: input.brainMode,
    bootstrapped: { attempted: false, created: 0, errors: [] },
    cognitiveRun: {
      attempted: false,
      runId: null,
      thesesUpdated: 0,
      surprisesCount: 0,
      totalTokens: 0,
      durationMs: 0,
      errors: [],
    },
    rebalance: {
      attempted: false,
      created: false,
      cycleId: null,
      proposalCount: 0,
      autoExecute: {
        attempted: false,
        executed: false,
        ordersCount: 0,
        blockedReason: null,
        error: null,
      },
      reason: null,
    },
    targetWeightPool: buildSkippedTargetWeightPool(null, input.config),
  };
}

function buildSkippedRebalance(reason: string): AutopilotLoopResult["rebalance"] {
  return {
    attempted: false,
    created: false,
    cycleId: null,
    proposalCount: 0,
    autoExecute: {
      attempted: false,
      executed: false,
      ordersCount: 0,
      blockedReason: null,
      error: null,
    },
    reason,
  };
}

function buildSkippedTargetWeightPool(
  reason: string | null,
  config?: DaaSystemConfig,
): AutopilotLoopResult["targetWeightPool"] {
  const targetWeightSuggestionPool = config ? resolveTargetWeightSuggestionPoolConfig(config) : null;
  return {
    attempted: false,
    enabled: targetWeightSuggestionPool?.enabled ?? false,
    targetPlanAvailable: false,
    acceptedCount: 0,
    skippedCount: 0,
    attemptedCount: 0,
    persistedCount: 0,
    failedCount: 0,
    minConfidence: targetWeightSuggestionPool?.minConfidence ?? 70,
    reason,
  };
}

export function getAutopilotRebalanceBlockedReasonAfterRun(errors: string[]): string | null {
  const meaningfulErrors = (errors || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (meaningfulErrors.length === 0) return null;
  return `投资助理本轮复核存在 ${meaningfulErrors.length} 个错误，自动调仓已降级为仅报告，避免把不完整推理直接转成交易。`;
}

export function validateAutopilotPrerequisites(config: DaaSystemConfig): {
  ready: boolean;
  missing: string[];
  reason: string | null;
} {
  const missing: string[] = [];
  const policy = resolvePolicyConfig(config);
  if (policy.enabled !== true) {
    missing.push("/policy/enabled");
  }
  if (policy.execution.autoGenerateEnabled !== true) {
    missing.push("/policy/execution/autoGenerateEnabled");
  }
  return {
    ready: missing.length === 0,
    missing,
    reason: missing.length > 0 ? `自动复核无法生成调仓周期，缺少必要开关：${missing.join(", ")}` : null,
  };
}

function buildFocusAssets(rows: Awaited<ReturnType<typeof listDaaAssetUniverse>>): BootstrapAsset[] {
  return rows
    .filter((row) => row.holdingQty > 0 || row.watchEnabled)
    .map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      holdingQty: row.holdingQty,
      lastPrice: row.lastPrice > 0 ? row.lastPrice : row.holdingPrice,
      role: row.holdingQty > 0 ? "holding" : "watchlist",
      notes: row.notes,
      tags: row.holdingQty > 0 ? row.holdingTags : row.watchTags,
    }));
}

async function ensureThesisCoverage(): Promise<AutopilotLoopResult["bootstrapped"]> {
  const count = await thesisStore.countThreads().catch(() => 0);
  const rows = await listDaaAssetUniverse().catch(() => []);
  const focusAssets = buildFocusAssets(rows);
  if (focusAssets.length === 0) return { attempted: false, created: 0, errors: ["当前没有持仓或观察列表，跳过自动建立初始投资判断。"] };

  const result = count === 0
    ? await bootstrapTheses(focusAssets)
    : await ensureAssetThesisCoverage(focusAssets);
  return { attempted: true, created: result.created, errors: result.errors };
}

type TargetWeightSuggestionPlan = ReturnType<typeof buildTargetWeightSuggestionPlan>;

async function buildTargetWeightSuggestionPlanForRun(input: {
  row: DaaStoreSystemConfigRow;
  overlay: AgentStrategyOverlay | null;
}): Promise<TargetWeightSuggestionPlan> {
  const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
  const currentTargetWeights = Object.fromEntries(
    bootstrap.assetUniverse.map((row) => [
      row.assetKey.toUpperCase(),
      Math.max(0, Number(row.targetWeightPct || 0) || 0) / 100,
    ]),
  );
  const targetWeightSuggestionPool = resolveTargetWeightSuggestionPoolConfig(input.row.config);
  return buildTargetWeightSuggestionPlan({
    overlay: input.overlay,
    knownAssetKeys: bootstrap.assetUniverse.map((row) => row.assetKey),
    currentTargetWeights,
    maxPositionPct: input.row.config.strategy.constraints.maxPositionPct,
    minConfidence: targetWeightSuggestionPool.minConfidence,
  });
}

async function maybePersistTargetWeightSuggestionPool(input: {
  row: DaaStoreSystemConfigRow;
  targetPlan: TargetWeightSuggestionPlan;
}): Promise<AutopilotLoopResult["targetWeightPool"]> {
  const targetWeightSuggestionPool = resolveTargetWeightSuggestionPoolConfig(input.row.config);
  const base: AutopilotLoopResult["targetWeightPool"] = {
    attempted: false,
    enabled: targetWeightSuggestionPool.enabled,
    targetPlanAvailable: input.targetPlan != null,
    acceptedCount: input.targetPlan?.acceptedCount ?? 0,
    skippedCount: input.targetPlan?.skippedCount ?? 0,
    attemptedCount: 0,
    persistedCount: 0,
    failedCount: 0,
    minConfidence: targetWeightSuggestionPool.minConfidence,
    reason: null,
  };

  if (!targetWeightSuggestionPool.enabled) {
    return { ...base, reason: "目标权重建议池开关未开启。" };
  }
  if (!input.targetPlan) {
    return { ...base, reason: "本轮未形成满足置信度、资产范围和投资判断依据条件的目标权重计划。" };
  }

  const persisted = await persistTargetWeightSuggestionPool({
    targetWeights: input.targetPlan.targetWeights,
    agentRunId: input.targetPlan.agentRunId,
    summary: input.targetPlan.summary,
    intentReasons: input.targetPlan.intentReasons,
  });
  return {
    ...base,
    attempted: true,
    attemptedCount: persisted.attemptedCount,
    persistedCount: persisted.persistedCount,
    failedCount: persisted.failedCount,
    reason: persisted.failedCount > 0
      ? `目标权重池部分写入失败：${persisted.persistedCount}/${persisted.attemptedCount} 已持久化。`
      : null,
  };
}

async function executeAutopilotRebalance(input: {
  cycle: RebalanceCycle;
  systemConfig: DaaSystemConfig;
  triggerSource: AutomationAuthorityTrigger;
}): Promise<AutopilotLoopResult["rebalance"]["autoExecute"]> {
  return executeAutoRebalanceCycle({
    cycle: input.cycle,
    systemConfig: input.systemConfig,
    triggerSource: input.triggerSource,
  });
}

async function maybeRunAgentDrivenRebalance(input: {
  row: DaaStoreSystemConfigRow;
  targetPlan: TargetWeightSuggestionPlan;
  source: AutopilotEventSource;
  reason: string;
  affectedSymbols?: string[];
}): Promise<AutopilotLoopResult["rebalance"]> {
  const empty: AutopilotLoopResult["rebalance"] = {
    attempted: false,
    created: false,
    cycleId: null,
    proposalCount: 0,
    autoExecute: {
      attempted: false,
      executed: false,
      ordersCount: 0,
      blockedReason: null,
      error: null,
    },
    reason: null,
  };

  if (input.source === "cron_cognitive_agent" && !input.targetPlan) {
    return {
      ...empty,
      reason: "定期后台复核未形成目标权重计划，本轮只更新复核状态，不创建调仓周期。",
    };
  }

  const prerequisites = validateAutopilotPrerequisites(input.row.config);
  if (!prerequisites.ready) {
    return { ...empty, reason: prerequisites.reason };
  }

  const affectedSymbols = (input.affectedSymbols || [])
    .map((symbol) => String(symbol || "").trim().toUpperCase())
    .filter(Boolean);
  const eventContext = [
    input.reason,
    affectedSymbols.length > 0 ? `影响标的: ${affectedSymbols.join(", ")}` : null,
  ].filter(Boolean).join("；");
  const rebalanceTriggerSource = resolveAutopilotRebalanceTriggerSource(input.source);

  const generated = await generateWorkbenchRebalanceCycle({
    triggerSource: rebalanceTriggerSource,
    triggerReason: input.targetPlan
      ? `${rebalanceTriggerSource === "scheduled_review" ? "定期目标权重复核" : "投资助理目标权重调仓"}: ${input.targetPlan.reason}；${input.targetPlan.summary}${eventContext ? `；触发事件: ${eventContext}` : ""}`
      : `投资助理自动复核${eventContext ? `: ${eventContext}` : ""}`,
    manual: false,
    targetAllocationPlan: input.targetPlan ? {
      agentRunId: input.targetPlan.agentRunId,
      targetWeights: input.targetPlan.targetWeights,
      baselineTargetWeights: input.targetPlan.baselineTargetWeights,
      intentReasons: input.targetPlan.intentReasons,
      summary: input.targetPlan.summary,
      reason: input.targetPlan.reason,
    } : undefined,
  });
  const cycle = generated.cycle;
  if (!generated.created || !cycle) {
    return {
      ...empty,
      attempted: true,
      reason: generated.message,
    };
  }

  await attachCycleToAgentDecisionAudits({
    agentRunId: input.targetPlan?.agentRunId,
    cycleId: cycle.cycleId,
    assetKeys: Object.keys(input.targetPlan?.targetWeights ?? {}),
  }).catch((error) => logSwallowed("autopilot.attachDecisionAuditCycle", error));

  return {
    attempted: true,
    created: true,
    cycleId: cycle.cycleId,
    proposalCount: cycle.proposals.length,
    autoExecute: await executeAutopilotRebalance({
      cycle,
      systemConfig: input.row.config,
      triggerSource: resolveAutopilotExecutionTriggerSource(input.source),
    }),
    reason: null,
  };
}

export async function runAutopilotLoop(input: RunAutopilotLoopInput): Promise<AutopilotLoopResult> {
  const row = await getDaaSystemConfig();
  const brain = resolveBrainConfig(row.config.brain);

  if (brain.mode !== "autopilot") {
    return buildSkippedResult({
      source: input.source,
      brainMode: brain.mode,
      reason: "当前不是自动复核授权。",
      config: row.config,
    });
  }
  if (row.config.cognitiveAgent?.enabled === false) {
    return buildSkippedResult({
      source: input.source,
      brainMode: brain.mode,
      reason: "投资助理复核已关闭。",
      config: row.config,
    });
  }
  const permission = evaluateBrainActionAuthority({
    systemConfig: row.config,
    action: "run_agent_cycle",
  });
  if (!permission.allowed) {
    return buildSkippedResult({
      source: input.source,
      brainMode: brain.mode,
      reason: permission.reason,
      config: row.config,
    });
  }

  const bootstrapped = await ensureThesisCoverage();
  const cognitiveRun: AutopilotLoopResult["cognitiveRun"] = {
    attempted: true,
    runId: null,
    thesesUpdated: 0,
    surprisesCount: 0,
    totalTokens: 0,
    durationMs: 0,
    errors: [],
  };

  const run = await runCognitiveAgentCycle(
    input.source === "cron_cognitive_agent" ? "scheduled" : "event_driven",
    { focusSymbols: input.affectedSymbols },
  );
  cognitiveRun.runId = run.runId;
  cognitiveRun.thesesUpdated = run.thesesUpdated;
  cognitiveRun.surprisesCount = run.surprises.length;
  cognitiveRun.totalTokens = run.totalTokens;
  cognitiveRun.durationMs = run.durationMs;
  cognitiveRun.errors = run.errors;

  const rebalanceBlockedReason = getAutopilotRebalanceBlockedReasonAfterRun(run.errors);
  const overlay = await getAgentStrategyOverlayForRun(run.runId).catch((error) => {
    logSwallowed("autopilot.overlay", error);
    return null;
  });
  let targetPlan: TargetWeightSuggestionPlan = null;
  let targetWeightPool: AutopilotLoopResult["targetWeightPool"] = rebalanceBlockedReason
    ? buildSkippedTargetWeightPool(rebalanceBlockedReason, row.config)
    : buildSkippedTargetWeightPool(null, row.config);

  if (!rebalanceBlockedReason) {
    let targetPlanError: string | null = null;
    targetPlan = await buildTargetWeightSuggestionPlanForRun({ row, overlay }).catch((error) => {
      logSwallowed("autopilot.targetWeightPlan", error);
      targetPlanError = error instanceof Error ? error.message : String(error || "");
      return null;
    });
    if (targetPlanError) {
      const targetWeightSuggestionPool = resolveTargetWeightSuggestionPoolConfig(row.config);
      targetWeightPool = {
        attempted: true,
        enabled: targetWeightSuggestionPool.enabled,
        targetPlanAvailable: false,
        acceptedCount: 0,
        skippedCount: 0,
        attemptedCount: 0,
        persistedCount: 0,
        failedCount: 0,
        minConfidence: targetWeightSuggestionPool.minConfidence,
        reason: `目标权重计划构建失败：${targetPlanError}`,
      };
    } else if (input.source === "cron_cognitive_agent") {
      const targetWeightSuggestionPool = resolveTargetWeightSuggestionPoolConfig(row.config);
      targetWeightPool = {
        attempted: false,
        enabled: targetWeightSuggestionPool.enabled,
        targetPlanAvailable: targetPlan != null,
        acceptedCount: targetPlan?.acceptedCount ?? 0,
        skippedCount: targetPlan?.skippedCount ?? 0,
        attemptedCount: 0,
        persistedCount: 0,
        failedCount: 0,
        minConfidence: targetWeightSuggestionPool.minConfidence,
        reason: targetPlan
          ? "定期复核使用临时目标权重，只有进入再平衡周期或执行成交后才写入持久目标。"
          : "定期复核未形成目标权重计划。",
      };
    } else {
      targetWeightPool = await maybePersistTargetWeightSuggestionPool({ row, targetPlan }).catch((error) => {
        logSwallowed("autopilot.targetWeightPool", error);
        const targetWeightSuggestionPool = resolveTargetWeightSuggestionPoolConfig(row.config);
        return {
          attempted: true,
          enabled: targetWeightSuggestionPool.enabled,
          targetPlanAvailable: targetPlan != null,
          acceptedCount: targetPlan?.acceptedCount ?? 0,
          skippedCount: targetPlan?.skippedCount ?? 0,
          attemptedCount: 0,
          persistedCount: 0,
          failedCount: 0,
          minConfidence: targetWeightSuggestionPool.minConfidence,
          reason: "目标权重建议池写入失败。",
        };
      });
    }
  }

  const rebalance = rebalanceBlockedReason
    ? buildSkippedRebalance(rebalanceBlockedReason)
    : await maybeRunAgentDrivenRebalance({
      row,
      targetPlan,
      source: input.source,
      reason: input.reason,
      affectedSymbols: input.affectedSymbols,
    }).catch((error) => {
      logSwallowed("autopilot.rebalance", error);
      return {
        attempted: true,
        created: false,
        cycleId: null,
        proposalCount: 0,
        autoExecute: {
          attempted: false,
          executed: false,
          ordersCount: 0,
          blockedReason: null,
          error: error instanceof Error ? error.message : String(error || ""),
        },
        reason: "投资助理主动调仓执行失败。",
      };
    });

  return {
    skipped: false,
    reason: null,
    source: input.source,
    brainMode: row.config.brain?.mode ?? "autopilot",
    bootstrapped,
    cognitiveRun,
    rebalance,
    targetWeightPool,
  };
}
