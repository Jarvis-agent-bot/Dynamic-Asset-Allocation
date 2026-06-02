import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";
import { parseDaaAssetKey } from "@/src/daa/assetKey";

import { patchWorkbenchAsset, upsertWorkbenchAsset } from "./workbenchApi";
import type { WorkbenchTargetWeightAuditContext } from "./workbenchApi";
import type { AssetUniverseView } from "./workbenchTypes";

type TargetWeightPatch = {
  assetKey: string;
  patch: {
    watchEnabled?: boolean;
    targetWeightHint: number;
  };
};

type TargetWeightUpsert = {
  market: string;
  symbol: string;
  watchEnabled: true;
  targetWeightHint: number;
};

type TargetWeightApplyPlan = {
  patches: TargetWeightPatch[];
  upserts: TargetWeightUpsert[];
};

function clampTargetWeightHint(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value > 1 ? value / 100 : value);
}

function parseTargetAssetKey(rawKey: string): {
  assetKey: string;
  market: string;
  symbol: string;
} | null {
  const parsed = parseDaaAssetKey(rawKey);
  if (!parsed) return null;
  return {
    assetKey: `${parsed.market}::${parsed.symbol}`,
    market: parsed.market,
    symbol: parsed.symbol,
  };
}

export function buildTargetWeightApplyPlan(input: {
  currentRows: Array<Pick<AssetUniverseView, "assetKey" | "watchEnabled" | "targetWeightHint">>;
  weightsPct: Record<string, number>;
}): TargetWeightApplyPlan {
  const desired = new Map<string, { market: string; symbol: string; targetWeightHint: number }>();

  for (const [rawKey, rawWeight] of Object.entries(input.weightsPct || {})) {
    const parsed = parseTargetAssetKey(rawKey);
    if (!parsed) {
      throw new Error(`无效的目标权重标的键：${rawKey}，请使用 MARKET::SYMBOL 格式`);
    }
    const targetWeightHint = clampTargetWeightHint(Number(rawWeight));
    if (!(targetWeightHint > 0)) continue;
    desired.set(parsed.assetKey.toUpperCase(), {
      market: parsed.market,
      symbol: parsed.symbol,
      targetWeightHint,
    });
  }

  const currentByAssetKey = new Map(
    input.currentRows.map((row) => [row.assetKey.toUpperCase(), row] as const),
  );

  const patches: TargetWeightPatch[] = [];
  const upserts: TargetWeightUpsert[] = [];

  for (const row of input.currentRows) {
    if (!(row.targetWeightHint > 0)) continue;
    if (desired.has(row.assetKey.toUpperCase())) continue;
    patches.push({
      assetKey: row.assetKey,
      patch: {
        targetWeightHint: 0,
      },
    });
  }

  for (const [assetKeyUpper, next] of desired.entries()) {
    const current = currentByAssetKey.get(assetKeyUpper);
    if (!current) {
      upserts.push({
        market: next.market,
        symbol: next.symbol,
        watchEnabled: true,
        targetWeightHint: next.targetWeightHint,
      });
      continue;
    }

    const currentHint = Math.max(0, Number(current.targetWeightHint) || 0);
    const needsWatchEnable = current.watchEnabled !== true;
    const needsWeightUpdate = Math.abs(currentHint - next.targetWeightHint) > 1e-9;
    if (!needsWatchEnable && !needsWeightUpdate) continue;

    patches.push({
      assetKey: current.assetKey,
      patch: {
        watchEnabled: needsWatchEnable ? true : undefined,
        targetWeightHint: next.targetWeightHint,
      },
    });
  }

  return { patches, upserts };
}

export async function applyWorkbenchTargetWeights(
  weightsPct: Record<string, number>,
  auditContext: WorkbenchTargetWeightAuditContext = {
    source: "target_allocation_apply",
    reason: "批量应用目标权重配置",
  },
): Promise<TargetWeightApplyPlan> {
  const model = await getWorkbenchReadModel({ syncPrices: false });
  const plan = buildTargetWeightApplyPlan({
    currentRows: model.bootstrap.assetUniverse.map((row) => ({
      assetKey: row.assetKey,
      watchEnabled: row.watchEnabled,
      targetWeightHint: row.targetWeightHint,
    })),
    weightsPct,
  });

  await Promise.all([
    ...plan.patches.map((item) => patchWorkbenchAsset(item.assetKey, {
      ...item.patch,
      targetWeightAudit: {
        ...auditContext,
        payload: {
          ...(auditContext.payload || {}),
          weightsPct,
          operation: "patch",
        },
      },
    })),
    ...plan.upserts.map((item) => upsertWorkbenchAsset({
      ...item,
      targetWeightAudit: {
        ...auditContext,
        payload: {
          ...(auditContext.payload || {}),
          weightsPct,
          operation: "upsert",
        },
      },
    })),
  ]);

  return plan;
}
