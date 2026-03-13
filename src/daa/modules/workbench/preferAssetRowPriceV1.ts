import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { getDaaSystemConfigV2, updateDaaAssetUniverseLastPriceV1 } from "@/src/daa/store/daaStorePgV1";
import { toYfinanceSymbolByMarketV1 } from "@/src/market/yfinanceSymbolV1";

import type { AssetUniverseViewV1 } from "./workbenchTypesV1";

function defaultMarketCacheConfigV1() {
  return {
    freshMinutes: 15,
    serveStaleHours: 48,
    rawRetentionDays: 90,
  };
}

export async function preferAssetRowPriceV1(
  row: AssetUniverseViewV1,
  source: string,
): Promise<AssetUniverseViewV1> {
  const yfinanceSymbol = row.yfinanceSymbol || toYfinanceSymbolByMarketV1(row.symbol, row.market);
  if (!yfinanceSymbol) return row;

  const systemRow = await getDaaSystemConfigV2();
  const priceFeedEnabled = systemRow.config.dataSources?.priceFeed?.enabled !== false;
  const marketCache = systemRow.config.dataSources?.priceFeed?.marketCache || defaultMarketCacheConfigV1();
  const key = `${String(row.market || "").toUpperCase()}::${String(row.symbol || "").toUpperCase()}`;
  const priced = await getMarketPricesWithCacheV1({
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
  await updateDaaAssetUniverseLastPriceV1({
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
