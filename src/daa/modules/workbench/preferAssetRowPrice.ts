import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { getDaaSystemConfig, updateDaaAssetUniverseLastPrice } from "@/src/daa/store/daaStorePg";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";

import type { AssetUniverseView } from "./workbenchTypes";

function defaultMarketCacheConfig() {
  return {
    freshMinutes: 15,
    serveStaleHours: 48,
    rawRetentionDays: 90,
  };
}

export async function preferAssetRowPrice(
  row: AssetUniverseView,
  source: string,
): Promise<AssetUniverseView> {
  const yfinanceSymbol = row.yfinanceSymbol || toYfinanceSymbolByMarket(row.symbol, row.market);
  if (!yfinanceSymbol) return row;

  const systemRow = await getDaaSystemConfig();
  const priceFeedEnabled = systemRow.config.dataSources?.priceFeed?.enabled !== false;
  const marketCache = systemRow.config.dataSources?.priceFeed?.marketCache || defaultMarketCacheConfig();
  const key = `${String(row.market || "").toUpperCase()}::${String(row.symbol || "").toUpperCase()}`;
  const priced = await getMarketPricesWithCache({
    assets: [{
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
    }],
    allowRefresh: priceFeedEnabled,
    forceRefresh: priceFeedEnabled,
    refreshBudget: 1,
    timeoutMs: 2600,
    source,
    freshSec: Math.max(60, marketCache.freshMinutes * 60),
    serveStaleSec: Math.max(3600, marketCache.serveStaleHours * 3600),
    rawRetentionDays: marketCache.rawRetentionDays,
    concurrency: 1,
  });
  const priceRow = priced[key];
  if (!priceRow || !(priceRow.price > 0) || !priceRow.priceUpdatedAt) return row;

  const updatedAt = priceRow.priceUpdatedAt;
  await updateDaaAssetUniverseLastPrice({
    assetKey: row.assetKey,
    lastPrice: priceRow.price,
    priceUpdatedAt: updatedAt,
  });

  return {
    ...row,
    yfinanceSymbol,
    lastPrice: priceRow.price,
    priceUpdatedAt: updatedAt,
    priceStatus: priceRow.priceStatus,
    priceSource: priceRow.priceSource || `${source}:yfinance:${yfinanceSymbol}`,
    priceAgeSec: priceRow.priceAgeSec,
  };
}
