import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { normalizeDaaCurrencyCodeV1 } from "@/src/daa/assetKeyV1";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";
import {
  inferInstrumentTypeByAssetClassV1,
  inferMarketGroupV1,
  inferRegionByMarketV1,
  normalizeAssetClassV1,
} from "@/src/daa/modules/workbench/assetTaxonomyV1";
import type {
  WorkbenchFeaturedAssetGroupV1,
  WorkbenchFeaturedAssetItemV1,
} from "@/src/daa/modules/workbench/workbenchTypesV1";
import {
  WORKBENCH_FEATURED_ASSETS_CATALOG_V1,
  type WorkbenchFeaturedAssetClassV1,
  type WorkbenchFeaturedMarketV1,
} from "@/src/daa/modules/workbench/featuredAssetsCatalogV1";
import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { toYfinanceSymbolByMarketV1 } from "@/src/market/yfinanceSymbolV1";

type FeaturedMarketFilterV1 = WorkbenchFeaturedMarketV1 | "ALL";
type FeaturedAssetClassFilterV1 = WorkbenchFeaturedAssetClassV1 | "ALL";

const MARKET_ORDER_V1: WorkbenchFeaturedMarketV1[] = ["US", "HK", "CN", "CRYPTO"];
const MARKET_LABEL_ZH_V1: Record<WorkbenchFeaturedMarketV1, string> = {
  US: "美股",
  HK: "港股",
  CN: "A股",
  CRYPTO: "加密",
};

function normalizeTextV1(value: unknown): string {
  return String(value || "").trim();
}

function clampLimitPerMarketV1(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.max(1, Math.min(20, Math.trunc(n)));
}

function normalizeMarketFilterV1(value: unknown): FeaturedMarketFilterV1 {
  const market = normalizeTextV1(value).toUpperCase();
  if (market === "US" || market === "HK" || market === "CN" || market === "CRYPTO") return market;
  return "ALL";
}

function normalizeAssetClassFilterV1(value: unknown): FeaturedAssetClassFilterV1 {
  const text = normalizeTextV1(value).toUpperCase();
  if (text === "ALL") return "ALL";
  const normalized = normalizeAssetClassV1(text, "EQUITY");
  if (normalized === "EQUITY" || normalized === "ETF" || normalized === "BOND" || normalized === "COMMODITY" || normalized === "CRYPTO") {
    return normalized;
  }
  return "EQUITY";
}

function quoteTypeV1(assetClass: WorkbenchFeaturedAssetClassV1): string {
  if (assetClass === "ETF" || assetClass === "COMMODITY") return "ETF";
  if (assetClass === "BOND") return "BOND";
  if (assetClass === "CRYPTO") return "CRYPTOCURRENCY";
  return "EQUITY";
}

function typeDispV1(assetClass: WorkbenchFeaturedAssetClassV1): string {
  if (assetClass === "ETF") return "ETF";
  if (assetClass === "BOND") return "债券";
  if (assetClass === "COMMODITY") return "商品";
  if (assetClass === "CRYPTO") return "加密资产";
  return "股票";
}

function toFeaturedItemV1(input: {
  symbol: string;
  market: WorkbenchFeaturedMarketV1;
  currency: string;
  assetClass: WorkbenchFeaturedAssetClassV1;
  name: string;
  exchange: string;
  thesisTagZh: string;
  price: number;
}): WorkbenchFeaturedAssetItemV1 {
  const symbol = normalizeTextV1(input.symbol).toUpperCase();
  const market = input.market;
  const currency = normalizeDaaCurrencyCodeV1(input.currency, market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD");
  const exchange = normalizeTextV1(input.exchange) || market;
  const assetClass = input.assetClass;
  const yfinanceSymbol = toYfinanceSymbolByMarketV1(symbol, market);
  const name = normalizeTextV1(input.name) || symbol;
  return {
    symbol,
    market,
    currency,
    price: Number.isFinite(input.price) && input.price > 0 ? input.price : 0,
    name,
    shortName: name,
    longName: name,
    exchange,
    exchangeDisp: exchange,
    quoteType: quoteTypeV1(assetClass),
    typeDisp: typeDispV1(assetClass),
    assetClass,
    region: inferRegionByMarketV1(market),
    instrumentType: inferInstrumentTypeByAssetClassV1(assetClass),
    marketGroup: inferMarketGroupV1({ market, assetClass }),
    yfinanceSymbol,
    thesisTagZh: normalizeTextV1(input.thesisTagZh),
  };
}

async function enrichPricesV1(
  items: WorkbenchFeaturedAssetItemV1[],
  opts: { freshSec: number; serveStaleSec: number; rawRetentionDays: number; allowRefresh: boolean },
): Promise<WorkbenchFeaturedAssetItemV1[]> {
  if (!items.length) return items;
  const refreshTargets = items.filter((item) => item.yfinanceSymbol);
  if (!refreshTargets.length) return items;

  const priced = await getMarketPricesWithCacheV1({
    assets: refreshTargets.map((item) => ({
      symbol: item.symbol,
      market: item.market,
      currency: item.currency,
    })),
    allowRefresh: opts.allowRefresh,
    forceRefresh: opts.allowRefresh,
    refreshBudget: refreshTargets.length,
    timeoutMs: 2400,
    source: "featured_assets",
    freshSec: opts.freshSec,
    serveStaleSec: opts.serveStaleSec,
    rawRetentionDays: opts.rawRetentionDays,
  });

  return items.map((item) => {
    const key = `${item.market}::${item.symbol}`;
    const priceRow = priced[key];
    if (!priceRow || !(priceRow.price > 0)) {
      return {
        ...item,
        price: 0,
        priceStatus: "missing",
        priceUpdatedAt: priceRow?.priceUpdatedAt || null,
        priceSource: priceRow?.priceSource || "featured_assets",
        priceAgeSec: priceRow?.priceAgeSec ?? null,
      };
    }
    return {
      ...item,
      price: priceRow.price,
      priceStatus: priceRow.priceStatus,
      priceUpdatedAt: priceRow.priceUpdatedAt,
      priceSource: priceRow.priceSource,
      priceAgeSec: priceRow.priceAgeSec,
    };
  });
}

function buildGroupRowsV1(input: {
  marketFilter: FeaturedMarketFilterV1;
  assetClassFilter: FeaturedAssetClassFilterV1;
  limitPerMarket: number;
}): Array<{
  market: WorkbenchFeaturedMarketV1;
  rows: WorkbenchFeaturedAssetItemV1[];
}> {
  const filtered = WORKBENCH_FEATURED_ASSETS_CATALOG_V1.filter((item) => {
    if (input.marketFilter !== "ALL" && item.market !== input.marketFilter) return false;
    if (input.assetClassFilter !== "ALL" && item.assetClass !== input.assetClassFilter) return false;
    return true;
  });

  return MARKET_ORDER_V1.map((market) => {
    const rows = filtered
      .filter((item) => item.market === market)
      .slice(0, input.limitPerMarket)
      .map((item) => toFeaturedItemV1({
        symbol: item.symbol,
        market: item.market,
        currency: item.currency,
        assetClass: item.assetClass,
        name: item.name,
        exchange: item.exchange,
        thesisTagZh: item.thesisTagZh,
        price: 0,
      }));
    return { market, rows };
  }).filter((group) => group.rows.length > 0);
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const marketFilter = normalizeMarketFilterV1(url.searchParams.get("market"));
    const assetClassFilter = normalizeAssetClassFilterV1(url.searchParams.get("assetClass"));
    const limitPerMarket = clampLimitPerMarketV1(url.searchParams.get("limitPerMarket"));
    const system = await getDaaSystemConfigV2();
    const priceFeedEnabled = system.config.dataSources?.priceFeed?.enabled !== false;
    const cacheConfig = system.config.dataSources?.priceFeed?.marketCache || {
      freshMinutes: 15,
      serveStaleHours: 48,
      rawRetentionDays: 90,
    };

    const groups = buildGroupRowsV1({ marketFilter, assetClassFilter, limitPerMarket });
    const pricedGroups: WorkbenchFeaturedAssetGroupV1[] = await Promise.all(
      groups.map(async (group) => ({
        market: group.market,
        marketLabelZh: MARKET_LABEL_ZH_V1[group.market],
        items: await enrichPricesV1(group.rows, {
          allowRefresh: priceFeedEnabled,
          freshSec: Math.max(60, cacheConfig.freshMinutes * 60),
          serveStaleSec: Math.max(3600, cacheConfig.serveStaleHours * 3600),
          rawRetentionDays: cacheConfig.rawRetentionDays,
        }),
      })),
    );

    return okV1({
      groups: pricedGroups,
      generatedAt: new Date().toISOString(),
    });
  });
}
