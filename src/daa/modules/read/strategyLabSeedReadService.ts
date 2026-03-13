import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";

import type { StrategyLabSeedReadModel } from "./readModels";

function normalizeSelectedAssetKeys(rows: AssetUniverseView[]): string[] {
  const preferred = rows.filter((row) => row.yfinanceSymbol && (row.watchEnabled || row.holdingQty > 0));
  if (preferred.length > 0) return preferred.map((row) => row.assetKey);
  return rows.filter((row) => row.yfinanceSymbol).slice(0, 8).map((row) => row.assetKey);
}

export async function buildStrategyLabSeedReadModel(): Promise<StrategyLabSeedReadModel> {
  const [bootstrap, system] = await Promise.all([
    buildWorkbenchBootstrap({ syncPrices: false, autoRiskCycle: false }),
    getDaaSystemConfig(),
  ]);

  const systemBaseCurrency = system.config.strategy.account.baseCurrency || bootstrap.baseCurrency || "USD";
  const rows = bootstrap.assetUniverse || [];
  const computedEquity = (bootstrap.account.totalEquity ?? 0) > 0
    ? Number(bootstrap.account.totalEquity)
    : rows.reduce((sum, row) => sum + Math.max(0, Number(row.valuationBase || 0)), 0) + Math.max(0, Number(bootstrap.account.cash || 0));
  const executionDefaults = getStrategyExecutionConfig(system.config);

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
    selectedAssetKeys: normalizeSelectedAssetKeys(rows),
    loadedAt: new Date().toISOString(),
  };
}
