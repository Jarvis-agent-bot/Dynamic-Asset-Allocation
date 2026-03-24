import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { normalizeDaaCurrencyCode } from "@/src/daa/assetKey";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import {
  inferInstrumentTypeByAssetClass,
  inferMarketGroup,
  inferRegionByMarket,
  normalizeAssetClass,
} from "@/src/daa/modules/workbench/assetTaxonomy";
import type {
  WorkbenchFeaturedAssetGroup,
  WorkbenchFeaturedAssetItem,
} from "@/src/daa/modules/workbench/workbenchTypes";
import {
  WORKBENCH_FEATURED_ASSETS_CATALOG_,
  type WorkbenchFeaturedAssetClass,
  type WorkbenchFeaturedMarket,
} from "@/src/daa/modules/workbench/featuredAssetsCatalog";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { normalizeText } from "@/src/daa/utils/normalize";

type FeaturedMarketFilter = WorkbenchFeaturedMarket | "ALL";
type FeaturedAssetClassFilter = WorkbenchFeaturedAssetClass | "ALL";

const MARKET_ORDER_: WorkbenchFeaturedMarket[] = ["US", "HK", "CN", "CRYPTO"];
const MARKET_LABEL_ZH_: Record<WorkbenchFeaturedMarket, string> = {
  US: "美股",
  HK: "港股",
  CN: "A股",
  CRYPTO: "加密",
};

function clampLimitPerMarket(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.max(1, Math.min(20, Math.trunc(n)));
}

function normalizeMarketFilter(value: unknown): FeaturedMarketFilter {
  const market = normalizeText(value).toUpperCase();
  if (market === "US" || market === "HK" || market === "CN" || market === "CRYPTO") return market;
  return "ALL";
}

function normalizeAssetClassFilter(value: unknown): FeaturedAssetClassFilter {
  const text = normalizeText(value).toUpperCase();
  if (text === "ALL") return "ALL";
  const normalized = normalizeAssetClass(text, "EQUITY");
  if (normalized === "EQUITY" || normalized === "ETF" || normalized === "BOND" || normalized === "COMMODITY" || normalized === "CRYPTO") {
    return normalized;
  }
  return "EQUITY";
}

function quoteType(assetClass: WorkbenchFeaturedAssetClass): string {
  if (assetClass === "ETF" || assetClass === "COMMODITY") return "ETF";
  if (assetClass === "BOND") return "BOND";
  if (assetClass === "CRYPTO") return "CRYPTOCURRENCY";
  return "EQUITY";
}

function typeDisp(assetClass: WorkbenchFeaturedAssetClass): string {
  if (assetClass === "ETF") return "ETF";
  if (assetClass === "BOND") return "债券";
  if (assetClass === "COMMODITY") return "商品";
  if (assetClass === "CRYPTO") return "加密资产";
  return "股票";
}

function toFeaturedItem(input: {
  symbol: string;
  market: WorkbenchFeaturedMarket;
  currency: string;
  assetClass: WorkbenchFeaturedAssetClass;
  name: string;
  exchange: string;
  thesisTagZh: string;
  price: number;
}): WorkbenchFeaturedAssetItem {
  const symbol = normalizeText(input.symbol).toUpperCase();
  const market = input.market;
  const currency = normalizeDaaCurrencyCode(input.currency, market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD");
  const exchange = normalizeText(input.exchange) || market;
  const assetClass = input.assetClass;
  const yfinanceSymbol = toYfinanceSymbolByMarket(symbol, market);
  const name = normalizeText(input.name) || symbol;
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
    quoteType: quoteType(assetClass),
    typeDisp: typeDisp(assetClass),
    assetClass,
    region: inferRegionByMarket(market),
    instrumentType: inferInstrumentTypeByAssetClass(assetClass),
    marketGroup: inferMarketGroup({ market, assetClass }),
    yfinanceSymbol,
    thesisTagZh: normalizeText(input.thesisTagZh),
  };
}

async function enrichPrices(
  items: WorkbenchFeaturedAssetItem[],
  opts: { freshSec: number; serveStaleSec: number; rawRetentionDays: number; allowRefresh: boolean },
): Promise<WorkbenchFeaturedAssetItem[]> {
  if (!items.length) return items;
  const refreshTargets = items.filter((item) => item.yfinanceSymbol);
  if (!refreshTargets.length) return items;

  const priced = await getMarketPricesWithCache({
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

function buildGroupRows(input: {
  marketFilter: FeaturedMarketFilter;
  assetClassFilter: FeaturedAssetClassFilter;
  limitPerMarket: number;
}): Array<{
  market: WorkbenchFeaturedMarket;
  rows: WorkbenchFeaturedAssetItem[];
}> {
  const filtered = WORKBENCH_FEATURED_ASSETS_CATALOG_.filter((item) => {
    if (input.marketFilter !== "ALL" && item.market !== input.marketFilter) return false;
    if (input.assetClassFilter !== "ALL" && item.assetClass !== input.assetClassFilter) return false;
    return true;
  });

  return MARKET_ORDER_.map((market) => {
    const rows = filtered
      .filter((item) => item.market === market)
      .slice(0, input.limitPerMarket)
      .map((item) => toFeaturedItem({
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
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const marketFilter = normalizeMarketFilter(url.searchParams.get("market"));
    const assetClassFilter = normalizeAssetClassFilter(url.searchParams.get("assetClass"));
    const limitPerMarket = clampLimitPerMarket(url.searchParams.get("limitPerMarket"));
    const system = await getDaaSystemConfig();
    const priceFeedEnabled = system.config.dataSources?.priceFeed?.enabled !== false;
    const cacheConfig = system.config.dataSources?.priceFeed?.marketCache || {
      freshMinutes: 15,
      serveStaleHours: 48,
      rawRetentionDays: 90,
    };

    const groups = buildGroupRows({ marketFilter, assetClassFilter, limitPerMarket });
    const pricedGroups: WorkbenchFeaturedAssetGroup[] = await Promise.all(
      groups.map(async (group) => ({
        market: group.market,
        marketLabelZh: MARKET_LABEL_ZH_[group.market],
        items: await enrichPrices(group.rows, {
          allowRefresh: priceFeedEnabled,
          freshSec: Math.max(60, cacheConfig.freshMinutes * 60),
          serveStaleSec: Math.max(3600, cacheConfig.serveStaleHours * 3600),
          rawRetentionDays: cacheConfig.rawRetentionDays,
        }),
      })),
    );

    return ok({
      groups: pricedGroups,
      generatedAt: new Date().toISOString(),
    });
  });
}
