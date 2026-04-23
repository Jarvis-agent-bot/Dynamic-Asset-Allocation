import { bootstrapTheses } from "@/src/daa/agent/bootstrap";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import type { AgentConfigOverlay } from "@/src/daa/agent/cognitiveTypes";
import { getAgentConfigOverlayForRun } from "@/src/daa/agent/store/overlayStore";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import {
  canBrainRunAction,
  isBrainConfigPatchAllowed,
  resolveBrainConfig,
} from "@/src/daa/brain/brainPolicy";
import type { DaaSystemConfig, DaaSystemConfigPatch } from "@/src/daa/config/systemConfig";
import { formatAssetLabel } from "@/src/daa/assetRegistry";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import {
  getDaaSystemConfig,
  listDaaAssetUniverse,
  patchDaaSystemConfig,
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
  configPatch: {
    attempted: boolean;
    applied: boolean;
    paths: string[];
    skippedPaths: string[];
    reason: string | null;
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
  forceAgentRun?: boolean;
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
    configPatch: {
      attempted: false,
      applied: false,
      paths: [],
      skippedPaths: [],
      reason: null,
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

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function uniquePatches(patches: DaaSystemConfigPatch[]): DaaSystemConfigPatch[] {
  const byPath = new Map<string, DaaSystemConfigPatch>();
  for (const patch of patches) {
    const path = String(patch.path || "").trim();
    if (!path) continue;
    byPath.set(path, { path, value: patch.value });
  }
  return Array.from(byPath.values());
}

export function buildAutopilotPrerequisitePatches(config: DaaSystemConfig): DaaSystemConfigPatch[] {
  const patches: DaaSystemConfigPatch[] = [];
  const agent = config.cognitiveAgent;
  const rebalance = config.rebalanceStrategy;

  if (agent?.agentOverlayEnabled !== true) {
    patches.push({ path: "/cognitiveAgent/agentOverlayEnabled", value: true });
  }
  if (agent?.agentTriggerEnabled !== true) {
    patches.push({ path: "/cognitiveAgent/agentTriggerEnabled", value: true });
  }
  if (rebalance.autoGenerateEnabled !== true) {
    patches.push({ path: "/rebalanceStrategy/autoGenerateEnabled", value: true });
  }
  if (rebalance.autoExecuteEnabled !== true) {
    patches.push({ path: "/rebalanceStrategy/autoExecuteEnabled", value: true });
  }

  return patches;
}

export function buildOverlayPatches(config: DaaSystemConfig, overlay: AgentConfigOverlay | null): DaaSystemConfigPatch[] {
  if (!overlay) return [];
  const patches: DaaSystemConfigPatch[] = [];

  const recommendedDrift = median(
    (overlay.driftOverrides ?? [])
      .map((item) => Number(item.recommendedThresholdPct))
      .filter((value) => value >= 0.02 && value <= 0.15),
  );
  if (recommendedDrift != null) {
    const current = config.rebalanceStrategy.drift.thresholdPct;
    const next = clampNumber(recommendedDrift, 0.02, 0.15);
    if (Math.abs(next - current) >= 0.005) {
      patches.push({ path: "/rebalanceStrategy/drift/thresholdPct", value: Number(next.toFixed(4)) });
    }
  }

  const riskLimits = (overlay.riskAdjustments ?? [])
    .map((item) => Number(item.maxPositionPctOverride))
    .filter((value) => value >= 0.1 && value <= 0.3);
  if (riskLimits.length > 0) {
    const current = config.strategy.constraints.maxPositionPct;
    const next = Math.min(current, ...riskLimits);
    if (next < current - 0.005) {
      patches.push({ path: "/strategy/constraints/maxPositionPct", value: Number(next.toFixed(4)) });
    }
  }

  if (overlay.rebalanceTrigger?.recommended && overlay.rebalanceTrigger.urgency === "urgent") {
    const current = config.rebalanceStrategy.autoExecuteMaxSinglePct ?? 10;
    const next = Math.min(current, 8);
    if (next < current) {
      patches.push({ path: "/rebalanceStrategy/autoExecuteMaxSinglePct", value: next });
    }
  }

  return patches;
}

async function applyAllowedConfigPatches(input: {
  row: DaaStoreSystemConfigRow;
  patches: DaaSystemConfigPatch[];
}): Promise<{
  row: DaaStoreSystemConfigRow;
  attempted: boolean;
  applied: boolean;
  paths: string[];
  skippedPaths: string[];
  reason: string | null;
}> {
  const patches = uniquePatches(input.patches);
  if (patches.length === 0) {
    return {
      row: input.row,
      attempted: false,
      applied: false,
      paths: [],
      skippedPaths: [],
      reason: null,
    };
  }

  const permission = canBrainRunAction(input.row.config, "apply_config_patch");
  if (!permission.allowed) {
    return {
      row: input.row,
      attempted: true,
      applied: false,
      paths: [],
      skippedPaths: patches.map((patch) => patch.path),
      reason: permission.reason,
    };
  }

  const allowed = patches.filter((patch) => isBrainConfigPatchAllowed(input.row.config, patch.path));
  const skippedPaths = patches
    .filter((patch) => !isBrainConfigPatchAllowed(input.row.config, patch.path))
    .map((patch) => patch.path);

  if (allowed.length === 0) {
    return {
      row: input.row,
      attempted: true,
      applied: false,
      paths: [],
      skippedPaths,
      reason: "没有命中配置 patch 白名单。",
    };
  }

  try {
    const saved = await patchDaaSystemConfig({
      patches: allowed,
      baseVersion: input.row.version,
    });
    return {
      row: saved,
      attempted: true,
      applied: true,
      paths: allowed.map((patch) => patch.path),
      skippedPaths,
      reason: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (message.startsWith("system_config_version_conflict:")) {
      const latest = await getDaaSystemConfig();
      const saved = await patchDaaSystemConfig({
        patches: allowed,
        baseVersion: latest.version,
      });
      return {
        row: saved,
        attempted: true,
        applied: true,
        paths: allowed.map((patch) => patch.path),
        skippedPaths,
        reason: "基于最新配置版本重试成功。",
      };
    }
    throw error;
  }
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
  if (!input.systemConfig.rebalanceStrategy.autoExecuteEnabled) {
    return {
      attempted: false,
      executed: false,
      ordersCount: 0,
      blockedReason: null,
      error: "自动执行未开启。",
    };
  }

  const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
  const totalEquity = Math.max(0, bootstrap.account.totalEquity ?? 0);
  const maxSinglePct = Math.max(0, input.systemConfig.rebalanceStrategy.autoExecuteMaxSinglePct ?? 10) / 100;
  const breachingProposal = totalEquity > 0 && maxSinglePct > 0
    ? input.cycle.proposals.find((proposal) => (proposal.suggestedNotional ?? 0) / totalEquity > maxSinglePct)
    : undefined;
  if (breachingProposal) {
    const label = formatAssetLabel({
      symbol: breachingProposal.symbol,
      assetKey: breachingProposal.assetKey,
    });
    return {
      attempted: true,
      executed: false,
      ordersCount: 0,
      blockedReason: `[autoExecuteMaxSinglePct 守门] ${label} 单笔 $${(breachingProposal.suggestedNotional ?? 0).toFixed(0)} 超过 NAV 的 ${(maxSinglePct * 100).toFixed(1)}% 上限，已阻止自动执行`,
      error: null,
    };
  }

  try {
    const execResult = await executeRebalanceViaGateway({
      cycleId: input.cycle.cycleId,
      executeMode: "all",
      notifyMode: "fanout",
    });
    const executedCount = execResult.logs.filter((row) => row.status === "executed").length;
    return {
      attempted: true,
      executed: executedCount > 0,
      ordersCount: executedCount,
      blockedReason: null,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      executed: false,
      ordersCount: 0,
      blockedReason: null,
      error: error instanceof Error ? error.message : String(error || ""),
    };
  }
}

async function maybeRunAgentDrivenRebalance(input: {
  row: DaaStoreSystemConfigRow;
  overlay: AgentConfigOverlay | null;
  reason: string;
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

  const trigger = input.overlay?.rebalanceTrigger;
  if (!trigger?.recommended) {
    return { ...empty, reason: "Agent 未建议主动调仓。" };
  }
  if (!input.row.config.cognitiveAgent?.agentTriggerEnabled) {
    return { ...empty, reason: "Agent 主动触发再平衡未开启。" };
  }
  if (!input.row.config.rebalanceStrategy.autoGenerateEnabled) {
    return { ...empty, reason: "自动生成调仓周期未开启。" };
  }

  const generated = await generateWorkbenchRebalanceCycle({
    triggerSource: "agent_trigger",
    triggerReason: `Agent 主动触发 (${trigger.urgency}): ${trigger.reasoning || input.reason}`,
    manual: false,
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
  let row = await getDaaSystemConfig();
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

  const prerequisitePatch = await applyAllowedConfigPatches({
    row,
    patches: buildAutopilotPrerequisitePatches(row.config),
  });
  row = prerequisitePatch.row;

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

  const latestRow = await getDaaSystemConfig();
  const overlay = await getAgentConfigOverlayForRun(run.runId);
  const overlayPatch = await applyAllowedConfigPatches({
    row: latestRow,
    patches: buildOverlayPatches(latestRow.config, overlay),
  });
  row = overlayPatch.row;

  const rebalance = await maybeRunAgentDrivenRebalance({
    row,
    overlay,
    reason: input.reason,
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

  const patchPaths = [...prerequisitePatch.paths, ...overlayPatch.paths];
  const skippedPaths = [...prerequisitePatch.skippedPaths, ...overlayPatch.skippedPaths];

  return {
    skipped: false,
    reason: null,
    source: input.source,
    brainMode: row.config.brain?.mode ?? "autopilot",
    bootstrapped,
    cognitiveRun,
    configPatch: {
      attempted: prerequisitePatch.attempted || overlayPatch.attempted,
      applied: prerequisitePatch.applied || overlayPatch.applied,
      paths: patchPaths,
      skippedPaths,
      reason: overlayPatch.reason ?? prerequisitePatch.reason,
    },
    rebalance,
  };
}
