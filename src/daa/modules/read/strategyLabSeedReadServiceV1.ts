import { getStrategyExecutionConfigV2 } from "@/src/daa/config/systemConfigV2";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";
import type { AssetUniverseViewV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchReadServiceV1";

import type { StrategyLabSeedReadModelV1 } from "./readModelsV1";

function normalizeSelectedAssetKeysV1(rows: AssetUniverseViewV1[]): string[] {
  const preferred = rows.filter((row) => row.yfinanceSymbol && (row.watchEnabled || row.holdingQty > 0));
  if (preferred.length > 0) return preferred.map((row) => row.assetKey);
  return rows.filter((row) => row.yfinanceSymbol).slice(0, 8).map((row) => row.assetKey);
}

export async function buildStrategyLabSeedReadModelV1(): Promise<StrategyLabSeedReadModelV1> {
  const [bootstrap, system] = await Promise.all([
    buildWorkbenchBootstrapV1({ syncPrices: false, autoRiskCycle: false }),
    getDaaSystemConfigV2(),
  ]);

  const systemBaseCurrency = system.config.strategy.account.baseCurrency || bootstrap.baseCurrency || "USD";
  const rows = bootstrap.assetUniverse || [];
  const computedEquity = (bootstrap.account.totalEquity ?? 0) > 0
    ? Number(bootstrap.account.totalEquity)
    : rows.reduce((sum, row) => sum + Math.max(0, Number(row.valuationBase || 0)), 0) + Math.max(0, Number(bootstrap.account.cash || 0));
  const executionDefaults = getStrategyExecutionConfigV2(system.config);

  return {
    bootstrap,
    baseCurrency: systemBaseCurrency,
    initialEquity: Math.max(1000, computedEquity || 100000),
    constraints: {
      maxPositionPct: Number(system.config.strategy.constraints.maxPositionPct) || 0.3,
      minNotional: Number(system.config.strategy.constraints.minNotional) || 200,
      maxOrderPctOfNav: executionDefaults.maxOrderPctOfNav,
    },
    policy: {
      thresholdPct: Number(system.config.rebalanceStrategy.drift.thresholdPct) || 0.05,
      minTradeNotional: Number(system.config.strategy.constraints.minNotional) || 200,
      cooldownSeconds: (Number(system.config.rebalanceStrategy.cooldownHours) || 72) * 3600,
    },
    execution: {
      feeRateBps: executionDefaults.feeRateBps,
      slippageBps: executionDefaults.slippageBps,
      maxOrderPctOfNav: executionDefaults.maxOrderPctOfNav,
    },
    availableAssets: rows.filter((row) => Boolean(row.yfinanceSymbol)),
    selectedAssetKeys: normalizeSelectedAssetKeysV1(rows),
    loadedAt: new Date().toISOString(),
  };
}
