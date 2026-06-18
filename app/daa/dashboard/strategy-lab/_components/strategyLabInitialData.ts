import { isVisibleHolding } from "@/app/daa/dashboard/_shared/holdingVisibility";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

export type StrategyLabInitialData = {
  assets: AssetUniverseView[];
  selectedAssets: string[];
  baseCurrency: string;
  minOrderNotional: number;
};

export function buildStrategyLabInitialData(input: {
  assets: AssetUniverseView[];
  baseCurrency: string;
  minOrderNotional: number;
}): StrategyLabInitialData {
  return {
    assets: input.assets,
    selectedAssets: input.assets
      .filter((asset) => isVisibleHolding(asset) || asset.watchEnabled)
      .map((asset) => asset.assetKey),
    baseCurrency: input.baseCurrency || "USD",
    minOrderNotional: Math.max(0, Number(input.minOrderNotional) || 0),
  };
}
