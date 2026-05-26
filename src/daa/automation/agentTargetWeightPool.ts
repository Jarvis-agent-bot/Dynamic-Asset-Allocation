import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { patchDaaAssetUniverseRow } from "@/src/daa/store/daaStorePg";
import { updateWatchlistAutoEntry } from "@/src/daa/store/watchlistAutoEntryStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type AiTargetWeightPoolConfig = {
  enabled: boolean;
  minConfidence: number;
  autoEnableEntry: boolean;
};

export type AgentTargetWeightPoolPatch = {
  assetKey: string;
  targetWeightHint: number;
  autoEntryEnabled: boolean;
  entryTargetWeightPct: number | null;
};

export type PersistAgentTargetWeightPoolResult = {
  attemptedCount: number;
  persistedCount: number;
  failedCount: number;
  patches: AgentTargetWeightPoolPatch[];
};

export function resolveAiTargetWeightPoolConfig(config: DaaSystemConfig): AiTargetWeightPoolConfig {
  const raw = config.watchlistEntry?.aiTargetWeightPool;
  return {
    enabled: raw?.enabled !== false,
    minConfidence: Math.max(0, Math.min(100, Number(raw?.minConfidence ?? 0) || 0)),
    autoEnableEntry: raw?.autoEnableEntry !== false,
  };
}

export function buildAgentTargetWeightPoolPatches(input: {
  targetWeights: Record<string, number> | null | undefined;
  autoEnableEntry: boolean;
}): AgentTargetWeightPoolPatch[] {
  return Object.entries(input.targetWeights || {})
    .map(([assetKey, value]) => {
      const normalizedKey = String(assetKey || "").trim().toUpperCase();
      const targetWeightHint = Math.max(0, Math.min(1, Number(value) || 0));
      if (!normalizedKey || !Number.isFinite(targetWeightHint)) return null;
      const shouldAutoEntry = input.autoEnableEntry && targetWeightHint > 0;
      return {
        assetKey: normalizedKey,
        targetWeightHint: Number(targetWeightHint.toFixed(6)),
        autoEntryEnabled: shouldAutoEntry,
        entryTargetWeightPct: shouldAutoEntry ? Number((targetWeightHint * 100).toFixed(4)) : null,
      } satisfies AgentTargetWeightPoolPatch;
    })
    .filter((row): row is AgentTargetWeightPoolPatch => row != null);
}

export async function persistAgentTargetWeightPool(input: {
  targetWeights: Record<string, number> | null | undefined;
  autoEnableEntry: boolean;
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
    if (input.autoEnableEntry) {
      const updated = await updateWatchlistAutoEntry(patch.assetKey, {
        autoEntryEnabled: patch.autoEntryEnabled,
        entryTargetWeightPct: patch.entryTargetWeightPct,
      });
      if (!updated) throw new Error(`entry candidate update failed: ${patch.assetKey}`);
    }
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
