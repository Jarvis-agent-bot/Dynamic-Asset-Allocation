import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { patchDaaAssetUniverseRow } from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

/**
 * Agent 目标权重池 —— 把 Agent 输出的目标权重写入 asset_universe 的 `targetWeightHint`
 * 字段，配合再平衡 cycle 的 drift 计算自然生成 BUY/SELL 提案。
 *
 * 历史上这里同时维护一份 watchlistAutoEntry 候选表，由独立的规则引擎触发 BUY。
 * 新架构下 Agent 直接通过 targetAllocationPlan + AutomationAuthority 决策，
 * 规则引擎已废弃，此模块只负责把 Agent 计划"落库"。
 */
export type AiTargetWeightPoolConfig = {
  enabled: boolean;
  minConfidence: number;
};

export type AgentTargetWeightPoolPatch = {
  assetKey: string;
  targetWeightHint: number;
};

export type PersistAgentTargetWeightPoolResult = {
  attemptedCount: number;
  persistedCount: number;
  failedCount: number;
  patches: AgentTargetWeightPoolPatch[];
};

export function resolveAiTargetWeightPoolConfig(config: DaaSystemConfig): AiTargetWeightPoolConfig {
  const raw = config.aiTargetWeightPool;
  return {
    enabled: raw?.enabled !== false,
    minConfidence: Math.max(0, Math.min(100, Number(raw?.minConfidence ?? 0) || 0)),
  };
}

export function buildAgentTargetWeightPoolPatches(input: {
  targetWeights: Record<string, number> | null | undefined;
}): AgentTargetWeightPoolPatch[] {
  return Object.entries(input.targetWeights || {})
    .map(([assetKey, value]) => {
      const normalizedKey = String(assetKey || "").trim().toUpperCase();
      const targetWeightHint = Math.max(0, Math.min(1, Number(value) || 0));
      if (!normalizedKey || !Number.isFinite(targetWeightHint)) return null;
      return {
        assetKey: normalizedKey,
        targetWeightHint: Number(targetWeightHint.toFixed(6)),
      } satisfies AgentTargetWeightPoolPatch;
    })
    .filter((row): row is AgentTargetWeightPoolPatch => row != null);
}

export async function persistAgentTargetWeightPool(input: {
  targetWeights: Record<string, number> | null | undefined;
}): Promise<PersistAgentTargetWeightPoolResult> {
  const patches = buildAgentTargetWeightPoolPatches(input);
  if (patches.length === 0) {
    return { attemptedCount: 0, persistedCount: 0, failedCount: 0, patches: [] };
  }

  const results = await Promise.allSettled(patches.map(async (patch) => {
    await patchDaaAssetUniverseRow({
      assetKey: patch.assetKey,
      watchEnabled: true,
      targetWeightHint: patch.targetWeightHint,
    });
    return patch;
  }));

  for (const result of results) {
    if (result.status === "rejected") {
      logSwallowed("agentTargetWeightPool.persist", result.reason);
    }
  }

  const persistedCount = results.filter((result) => result.status === "fulfilled").length;
  return {
    attemptedCount: patches.length,
    persistedCount,
    failedCount: patches.length - persistedCount,
    patches,
  };
}
