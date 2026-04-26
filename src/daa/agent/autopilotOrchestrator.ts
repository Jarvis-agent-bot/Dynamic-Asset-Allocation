import { bootstrapTheses } from "@/src/daa/agent/bootstrap";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import type { AgentConfigOverlay } from "@/src/daa/agent/cognitiveTypes";
import { getAgentConfigOverlayForRun } from "@/src/daa/agent/store/overlayStore";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import {
  canBrainRunAction,
  resolveBrainConfig,
} from "@/src/daa/brain/brainPolicy";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { buildAgentTargetWeightOverrides } from "@/src/daa/automation/automationGuards";
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

export type AutopilotLoopResult = {
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
  };
}

export function validateAutopilotPrerequisites(config: DaaSystemConfig): {
  ready: boolean;
  missing: string[];
  reason: string | null;
} {
  const missing: string[] = [];
  if (config.rebalanceStrategy.autoGenerateEnabled !== true) {
    missing.push("/rebalanceStrategy/autoGenerateEnabled");
  }
  if (config.rebalanceStrategy.autoExecuteEnabled !== true) {
    missing.push("/rebalanceStrategy/autoExecuteEnabled");
  }
  return {
    ready: missing.length === 0,
    missing,
    reason: missing.length > 0 ? `自动驾驶缺少必要开关：${missing.join(", ")}` : null,
  };
}

async function ensureThesesIfNeeded(): Promise<AutopilotLoopResult["bootstrapped"]> {
  const count = await thesisStore.countThreads().catch(() => 0);
  if (count > 0) return { attempted: false, created: 0, errors: [] };

  const rows = await listDaaAssetUniverse().catch(() => []);
  const holdings = rows
    .filter((row) => row.holdingQty > 0)
    .map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      holdingQty: row.holdingQty,
      lastPrice: row.lastPrice,
    }));
  if (holdings.length === 0) return { attempted: false, created: 0, errors: ["当前没有持仓，跳过自动初始化论点。"] };

  const result = await bootstrapTheses(holdings);
  return { attempted: true, created: result.created, errors: result.errors };
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
  overlay: AgentConfigOverlay | null;
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

  const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
  const targetPlan = buildAgentTargetWeightOverrides({
    overlay: input.overlay,
    knownAssetKeys: bootstrap.assetUniverse.map((row) => row.assetKey),
    maxPositionPct: input.row.config.strategy.constraints.maxPositionPct,
    minConfidence: 70,
  });
  if (!targetPlan) {
    return { ...empty, reason: "Agent 未给出可执行目标权重计划。" };
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

  const generated = await generateWorkbenchRebalanceCycle({
    triggerSource: "agent_trigger",
    triggerReason: `Agent 目标权重调仓: ${targetPlan.reason}；${targetPlan.summary}${eventContext ? `；触发事件: ${eventContext}` : ""}`,
    manual: false,
    targetWeightOverrides: targetPlan?.targetWeightOverrides,
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
    });
  }
  if (row.config.cognitiveAgent?.enabled === false) {
    return buildSkippedResult({
      source: input.source,
      brainMode: brain.mode,
      reason: "认知 Agent 已关闭。",
    });
  }
  const permission = canBrainRunAction(row.config, "run_agent_cycle");
  if (!permission.allowed) {
    return buildSkippedResult({
      source: input.source,
      brainMode: brain.mode,
      reason: permission.reason,
    });
  }

  const bootstrapped = await ensureThesesIfNeeded();
  const cognitiveRun: AutopilotLoopResult["cognitiveRun"] = {
    attempted: true,
    runId: null,
    thesesUpdated: 0,
    surprisesCount: 0,
    totalTokens: 0,
    durationMs: 0,
    errors: [],
  };

  const run = await runCognitiveAgentCycle(input.source === "cron_cognitive_agent" ? "scheduled" : "event_driven");
  cognitiveRun.runId = run.runId;
  cognitiveRun.thesesUpdated = run.thesesUpdated;
  cognitiveRun.surprisesCount = run.surprises.length;
  cognitiveRun.totalTokens = run.totalTokens;
  cognitiveRun.durationMs = run.durationMs;
  cognitiveRun.errors = run.errors;

  const overlay = await getAgentConfigOverlayForRun(run.runId);

  const rebalance = await maybeRunAgentDrivenRebalance({
    row,
    overlay,
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
  };
}
