import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";

import { patchWorkbenchAsset, upsertWorkbenchAsset } from "./workbenchApi";
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

export type TargetWeightApplyPlan = {
  patches: TargetWeightPatch[];
  upserts: TargetWeightUpsert[];
};

function clampTargetWeightHint(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value > 1 ? value / 100 : value);
}

export function parseLooseTargetAssetKey(rawKey: string): {
  assetKey: string;
  market: string;
  symbol: string;
} | null {
  const text = String(rawKey || "").trim().toUpperCase();
  if (!text) return null;

  const doubleColon = text.indexOf("::");
  if (doubleColon > 0 && doubleColon < text.length - 2) {
    const market = text.slice(0, doubleColon).trim();
    const symbol = text.slice(doubleColon + 2).trim();
    if (!market || !symbol) return null;
    return {
      assetKey: `${market}::${symbol}`,
      market,
      symbol,
    };
  }

  const singleColon = text.indexOf(":");
  if (singleColon > 0 && singleColon < text.length - 1) {
    const market = text.slice(0, singleColon).trim();
    const symbol = text.slice(singleColon + 1).trim();
    if (!market || !symbol) return null;
    return {
      assetKey: `${market}::${symbol}`,
      market,
      symbol,
    };
  }

  return {
    assetKey: `US::${text}`,
    market: "US",
    symbol: text,
  };
}

export function buildTargetWeightApplyPlan(input: {
  currentRows: Array<Pick<AssetUniverseView, "assetKey" | "watchEnabled" | "targetWeightHint">>;
  weightsPct: Record<string, number>;
}): TargetWeightApplyPlan {
  const desired = new Map<string, { market: string; symbol: string; targetWeightHint: number }>();

  for (const [rawKey, rawWeight] of Object.entries(input.weightsPct || {})) {
    const parsed = parseLooseTargetAssetKey(rawKey);
    if (!parsed) {
      throw new Error(`无效的目标权重标的键：${rawKey}`);
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

export async function applyWorkbenchTargetWeights(weightsPct: Record<string, number>): Promise<TargetWeightApplyPlan> {
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
    ...plan.patches.map((item) => patchWorkbenchAsset(item.assetKey, item.patch)),
    ...plan.upserts.map((item) => upsertWorkbenchAsset(item)),
  ]);

  return plan;
}
