import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { patchDaaAssetUniverseRow } from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

/**
 * 目标权重建议池 —— 把投资助理输出的目标权重写入 asset_universe 的 `targetWeightHint`
 * 字段，配合再平衡 cycle 的 drift 计算自然生成 BUY/SELL 提案。
 *
 * 历史上这里同时维护一份 watchlistAutoEntry 候选表，由独立的规则引擎触发 BUY。
 * 新架构下投资助理直接通过 targetAllocationPlan + AutomationAuthority 决策，
 * 规则引擎已废弃，此模块只负责把目标权重建议落库。
 */
export type TargetWeightSuggestionPoolConfig = {
  enabled: boolean;
  minConfidence: number;
};

export type TargetWeightSuggestionPatch = {
  assetKey: string;
  targetWeightHint: number;
};

export type PersistTargetWeightSuggestionPoolResult = {
  attemptedCount: number;
  persistedCount: number;
  failedCount: number;
  patches: TargetWeightSuggestionPatch[];
};

export function resolveTargetWeightSuggestionPoolConfig(config: DaaSystemConfig): TargetWeightSuggestionPoolConfig {
  const raw = config.aiTargetWeightPool;
  return {
    enabled: raw?.enabled !== false,
    minConfidence: Math.max(0, Math.min(100, Number(raw?.minConfidence ?? 0) || 0)),
  };
}

export function buildTargetWeightSuggestionPatches(input: {
  targetWeights: Record<string, number> | null | undefined;
}): TargetWeightSuggestionPatch[] {
  return Object.entries(input.targetWeights || {})
    .map(([assetKey, value]) => {
      const normalizedKey = String(assetKey || "").trim().toUpperCase();
      const targetWeightHint = Math.max(0, Math.min(1, Number(value) || 0));
      if (!normalizedKey || !Number.isFinite(targetWeightHint)) return null;
      return {
        assetKey: normalizedKey,
        targetWeightHint: Number(targetWeightHint.toFixed(6)),
      } satisfies TargetWeightSuggestionPatch;
    })
    .filter((row): row is TargetWeightSuggestionPatch => row != null);
}

export async function persistTargetWeightSuggestionPool(input: {
  targetWeights: Record<string, number> | null | undefined;
  agentRunId?: string | null;
  summary?: string | null;
  intentReasons?: Record<string, {
    symbol?: string;
    proposedTargetWeightPct?: number;
    baselineTargetWeightPct?: number;
    confidence?: number;
    reasoning?: string;
  }> | null;
}): Promise<PersistTargetWeightSuggestionPoolResult> {
  const patches = buildTargetWeightSuggestionPatches(input);
  if (patches.length === 0) {
    return { attemptedCount: 0, persistedCount: 0, failedCount: 0, patches: [] };
  }

  const results = await Promise.allSettled(patches.map(async (patch) => {
    const intentReason = input.intentReasons?.[patch.assetKey] ?? input.intentReasons?.[patch.assetKey.toUpperCase()];
    await patchDaaAssetUniverseRow({
      assetKey: patch.assetKey,
      watchEnabled: true,
      targetWeightHint: patch.targetWeightHint,
      targetWeightAudit: {
        source: "agent_target_weight_pool",
        reason: intentReason?.reasoning || input.summary || "目标权重建议池写入",
        actor: "cognitive_agent",
        agentRunId: input.agentRunId ?? null,
        payload: {
          summary: input.summary ?? null,
          intentReason: intentReason ?? null,
          targetWeights: input.targetWeights ?? {},
        },
      },
    });
    return patch;
  }));

  for (const result of results) {
    if (result.status === "rejected") {
      logSwallowed("targetWeightSuggestionPool.persist", result.reason);
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
