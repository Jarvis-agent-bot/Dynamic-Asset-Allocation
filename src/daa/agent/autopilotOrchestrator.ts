import { bootstrapTheses, ensureAssetThesisCoverage, type BootstrapAsset } from "@/src/daa/agent/bootstrap";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import type { AgentStrategyOverlay } from "@/src/daa/agent/cognitiveTypes";
import { getAgentStrategyOverlayForRun } from "@/src/daa/agent/store/overlayStore";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import { resolveBrainConfig } from "@/src/daa/brain/brainPolicy";
import { evaluateBrainActionAuthority } from "@/src/daa/automation/automationAuthority";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { buildAgentTargetWeightOverrides } from "@/src/daa/automation/automationGuards";
import {
  persistAgentTargetWeightPool,
  resolveAiTargetWeightPoolConfig,
} from "@/src/daa/automation/agentTargetWeightPool";
import { executeAutoRebalanceCycle } from "@/src/daa/automation/autoRebalanceExecution";
import {
  getDaaSystemConfig,
  listDaaAssetUniverse,
} from "@/src/daa/store/daaStorePg";
import type { DaaStoreSystemConfigRow } from "@/src/daa/store/storeTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

type AutopilotEventSource =
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
    autoEnableEntry: boolean;
    reason: string | null;
  };
};

type RunAutopilotLoopInput = {
  source: AutopilotEventSource;
  reason: string;
  affectedSymbols?: string[];
};

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
  const aiTargetWeightPool = config ? resolveAiTargetWeightPoolConfig(config) : null;
  return {
    attempted: false,
    enabled: aiTargetWeightPool?.enabled ?? false,
    targetPlanAvailable: false,
    acceptedCount: 0,
    skippedCount: 0,
    attemptedCount: 0,
    persistedCount: 0,
    failedCount: 0,
    minConfidence: aiTargetWeightPool?.minConfidence ?? 70,
    autoEnableEntry: aiTargetWeightPool?.autoEnableEntry ?? true,
    reason,
  };
}

export function getAutopilotRebalanceBlockedReasonAfterRun(errors: string[]): string | null {
  const meaningfulErrors = (errors || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (meaningfulErrors.length === 0) return null;
  return `认知 Agent 本轮存在 ${meaningfulErrors.length} 个错误，自动调仓已降级为仅报告，避免把不完整推理直接转成交易。`;
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
    reason: missing.length > 0 ? `自动驾驶无法生成调仓周期，缺少必要开关：${missing.join(", ")}` : null,
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
  if (focusAssets.length === 0) return { attempted: false, created: 0, errors: ["当前没有持仓或观察列表，跳过自动初始化论点。"] };

  const result = count === 0
    ? await bootstrapTheses(focusAssets)
    : await ensureAssetThesisCoverage(focusAssets);
  return { attempted: true, created: result.created, errors: result.errors };
}

type AgentTargetWeightPlan = ReturnType<typeof buildAgentTargetWeightOverrides>;

async function buildAgentTargetWeightPlan(input: {
  row: DaaStoreSystemConfigRow;
  overlay: AgentStrategyOverlay | null;
}): Promise<AgentTargetWeightPlan> {
  const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
  const currentTargetWeights = Object.fromEntries(
    bootstrap.assetUniverse.map((row) => [
      row.assetKey.toUpperCase(),
      Math.max(0, Number(row.targetWeightPct || 0) || 0) / 100,
    ]),
  );
  const aiTargetWeightPool = resolveAiTargetWeightPoolConfig(input.row.config);
  return buildAgentTargetWeightOverrides({
    overlay: input.overlay,
    knownAssetKeys: bootstrap.assetUniverse.map((row) => row.assetKey),
    currentTargetWeights,
    maxPositionPct: input.row.config.strategy.constraints.maxPositionPct,
    minConfidence: aiTargetWeightPool.minConfidence,
  });
}

async function maybePersistAgentTargetWeightPool(input: {
  row: DaaStoreSystemConfigRow;
  targetPlan: AgentTargetWeightPlan;
}): Promise<AutopilotLoopResult["targetWeightPool"]> {
  const aiTargetWeightPool = resolveAiTargetWeightPoolConfig(input.row.config);
  const base: AutopilotLoopResult["targetWeightPool"] = {
    attempted: false,
    enabled: aiTargetWeightPool.enabled,
    targetPlanAvailable: input.targetPlan != null,
    acceptedCount: input.targetPlan?.acceptedCount ?? 0,
    skippedCount: input.targetPlan?.skippedCount ?? 0,
    attemptedCount: 0,
    persistedCount: 0,
    failedCount: 0,
    minConfidence: aiTargetWeightPool.minConfidence,
    autoEnableEntry: aiTargetWeightPool.autoEnableEntry,
    reason: null,
  };

  if (!aiTargetWeightPool.enabled) {
    return { ...base, reason: "AI 目标权重池开关未开启。" };
  }
  if (!input.targetPlan) {
    return { ...base, reason: "本轮未形成满足置信度、资产范围和论点支持条件的目标权重计划。" };
  }

  const persisted = await persistAgentTargetWeightPool({
    targetWeightOverrides: input.targetPlan.targetWeightOverrides,
    autoEnableEntry: aiTargetWeightPool.autoEnableEntry,
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
}): Promise<AutopilotLoopResult["rebalance"]["autoExecute"]> {
  return executeAutoRebalanceCycle({
    cycle: input.cycle,
    systemConfig: input.systemConfig,
    triggerSource: "agent_trigger",
  });
}

async function maybeRunAgentDrivenRebalance(input: {
  row: DaaStoreSystemConfigRow;
  targetPlan: AgentTargetWeightPlan;
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

  const generated = await generateWorkbenchRebalanceCycle({
    triggerSource: "agent_trigger",
    triggerReason: input.targetPlan
      ? `Agent 目标权重调仓: ${input.targetPlan.reason}；${input.targetPlan.summary}${eventContext ? `；触发事件: ${eventContext}` : ""}`
      : `Agent 自动驾驶检查${eventContext ? `: ${eventContext}` : ""}`,
    manual: false,
    targetWeightOverrides: input.targetPlan?.targetWeightOverrides,
  });
  const cycle = generated.cycle;
  if (!generated.created || !cycle) {
    return {
      ...empty,
      attempted: true,
      reason: generated.message,
    };
  }

  return {
    attempted: true,
    created: true,
    cycleId: cycle.cycleId,
    proposalCount: cycle.proposals.length,
    autoExecute: await executeAutopilotRebalance({
      cycle,
      systemConfig: input.row.config,
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
      reason: "当前不是自动驾驶模式。",
      config: row.config,
    });
  }
  if (row.config.cognitiveAgent?.enabled === false) {
    return buildSkippedResult({
      source: input.source,
      brainMode: brain.mode,
      reason: "认知 Agent 已关闭。",
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
  let targetPlan: AgentTargetWeightPlan = null;
  let targetWeightPool: AutopilotLoopResult["targetWeightPool"] = rebalanceBlockedReason
    ? buildSkippedTargetWeightPool(rebalanceBlockedReason, row.config)
    : buildSkippedTargetWeightPool(null, row.config);

  if (!rebalanceBlockedReason) {
    let targetPlanError: string | null = null;
    targetPlan = await buildAgentTargetWeightPlan({ row, overlay }).catch((error) => {
      logSwallowed("autopilot.targetWeightPlan", error);
      targetPlanError = error instanceof Error ? error.message : String(error || "");
      return null;
    });
    if (targetPlanError) {
      const aiTargetWeightPool = resolveAiTargetWeightPoolConfig(row.config);
      targetWeightPool = {
        attempted: true,
        enabled: aiTargetWeightPool.enabled,
        targetPlanAvailable: false,
        acceptedCount: 0,
        skippedCount: 0,
        attemptedCount: 0,
        persistedCount: 0,
        failedCount: 0,
        minConfidence: aiTargetWeightPool.minConfidence,
        autoEnableEntry: aiTargetWeightPool.autoEnableEntry,
        reason: `AI 目标权重计划构建失败：${targetPlanError}`,
      };
    } else {
      targetWeightPool = await maybePersistAgentTargetWeightPool({ row, targetPlan }).catch((error) => {
        logSwallowed("autopilot.targetWeightPool", error);
        const aiTargetWeightPool = resolveAiTargetWeightPoolConfig(row.config);
        return {
          attempted: true,
          enabled: aiTargetWeightPool.enabled,
          targetPlanAvailable: targetPlan != null,
          acceptedCount: targetPlan?.acceptedCount ?? 0,
          skippedCount: targetPlan?.skippedCount ?? 0,
          attemptedCount: 0,
          persistedCount: 0,
          failedCount: 0,
          minConfidence: aiTargetWeightPool.minConfidence,
          autoEnableEntry: aiTargetWeightPool.autoEnableEntry,
          reason: "AI 目标权重池写入失败。",
        };
      });
    }
  }

  const rebalance = rebalanceBlockedReason
    ? buildSkippedRebalance(rebalanceBlockedReason)
    : await maybeRunAgentDrivenRebalance({
      row,
      targetPlan,
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
        reason: "Agent 主动调仓执行失败。",
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
