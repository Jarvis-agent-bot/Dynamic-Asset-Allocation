import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  inferAssetClassByQuoteType,
  inferInstrumentTypeByAssetClass,
  inferMarketGroup,
  inferRegionByMarket,
  normalizeAssetClass,
  normalizeRegion,
} from "@/src/daa/modules/workbench/assetTaxonomy";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { normalizeDaaCurrencyCode } from "@/src/daa/assetKey";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { normalizeText, toPositive } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { getAssetDisplayName } from "@/src/daa/assetRegistry";
import { getYahooProvider } from "@/src/market/yahooProvider";

type LookupMarket = "US" | "HK" | "CN" | "CRYPTO" | "COMMODITY" | "OTHER";

type SearchAssetItem = {
  symbol: string;
  market: LookupMarket;
  currency: string;
  price: number;
  priceStatus?: "fresh" | "stale" | "missing";
  priceUpdatedAt?: string | null;
  priceSource?: string;
  priceAgeSec?: number | null;
  name: string;
  displayNameZh: string | null;
  shortName: string;
  longName: string;
  exchange: string;
  exchangeDisp: string;
  quoteType: string;
  typeDisp: string;
  assetClass: string;
  region: string;
  instrumentType: string;
  marketGroup: string;
  yfinanceSymbol: string;
};

const SEARCH_LIMIT_MAX = 35;

function clampLimit(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 15;
  return Math.max(1, Math.min(SEARCH_LIMIT_MAX, Math.trunc(n)));
}


type YahooQuoteRaw = {
  symbol?: unknown;
  exchange?: unknown;
  exchDisp?: unknown;
  shortname?: unknown;
  longname?: unknown;
  quoteType?: unknown;
  typeDisp?: unknown;
  currency?: unknown;
  region?: unknown;
  regularMarketPrice?: unknown;
  postMarketPrice?: unknown;
  bid?: unknown;
  ask?: unknown;
};

function safeQuote(raw: unknown): YahooQuoteRaw {
  if (!raw || typeof raw !== "object") return {};
  return raw as YahooQuoteRaw;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeQuotesArray(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  return Array.isArray(obj.quotes) ? obj.quotes : [];
}

const COMMODITY_FUTURE_SYMBOLS_ = new Set(["GC=F", "SI=F", "CL=F", "BZ=F", "HG=F", "NG=F"]);
const COMMODITY_ETF_SYMBOLS_ = new Set(["GLD", "IAU", "SLV", "USO", "BNO", "DBC", "DBA"]);

function shouldSkipQuote(input: { quoteType: unknown; symbol: string }): boolean {
  const quoteType = normalizeText(input.quoteType).toUpperCase();
  const symbol = normalizeText(input.symbol).toUpperCase();
  if (!quoteType) return false;
  if (quoteType === "OPTION") return true;
  if (quoteType === "FUTURE") return !COMMODITY_FUTURE_SYMBOLS_.has(symbol);
  if (quoteType === "WARRANT") return true;
  return false;
}

async function enrichPreferredPrice(
  items: SearchAssetItem[],
  maxFetch = 10,
  opts: { freshSec: number; serveStaleSec: number; rawRetentionDays: number; allowRefresh: boolean },
): Promise<SearchAssetItem[]> {
  if (items.length <= 0) return items;
  const refreshTargets = items.filter((item) => item.yfinanceSymbol).slice(0, Math.max(1, Math.trunc(maxFetch)));
  if (refreshTargets.length <= 0) return items;

  const priced = await getMarketPricesWithCache({
    assets: refreshTargets.map((item) => ({
      symbol: item.symbol,
      market: item.market,
      currency: item.currency,
    })),
    allowRefresh: opts.allowRefresh,
    forceRefresh: opts.allowRefresh,
    refreshBudget: refreshTargets.length,
    timeoutMs: 2300,
    source: "search_assets",
    freshSec: opts.freshSec,
    serveStaleSec: opts.serveStaleSec,
    rawRetentionDays: opts.rawRetentionDays,
  });

  return items.map((item) => {
    const key = `${item.market}::${item.symbol}`.toUpperCase();
    const priceRow = priced[key];
    if (!priceRow || !(priceRow.price > 0)) return item;
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

function inferMarket(symbolRaw: unknown, exchangeRaw: unknown): LookupMarket {
  const symbol = normalizeText(symbolRaw).toUpperCase();
  const exchange = normalizeText(exchangeRaw).toUpperCase();
  if (COMMODITY_FUTURE_SYMBOLS_.has(symbol) || symbol.includes("=F")) return "COMMODITY";
  if (symbol.includes("-USD")) return "CRYPTO";
  if (symbol.endsWith(".HK") || exchange.includes("HK") || exchange.includes("HONG KONG")) return "HK";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ") || exchange.includes("SHANGHAI") || exchange.includes("SHENZHEN") || exchange.includes("SSE")) return "CN";
  if (exchange.includes("NYSE") || exchange.includes("NASDAQ") || exchange.includes("AMEX") || exchange.includes("ARCA") || exchange.includes("NMS")) return "US";
  if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol) && !symbol.includes(".")) return "US";
  return "OTHER";
}

function shouldTreatAsCommodity(input: {
  symbol: string;
  quoteType: string;
  name: string;
  shortName: string;
  longName: string;
  typeDisp: string;
}): boolean {
  const symbol = normalizeText(input.symbol).toUpperCase();
  const quoteType = normalizeText(input.quoteType).toUpperCase();
  const text = [
    input.name,
    input.shortName,
    input.longName,
    input.typeDisp,
  ].map((item) => normalizeText(item).toUpperCase()).join(" ");

  if (quoteType === "COMMODITY") return true;
  if (COMMODITY_FUTURE_SYMBOLS_.has(symbol)) return true;
  if (COMMODITY_ETF_SYMBOLS_.has(symbol)) return true;
  if (quoteType !== "ETF" && quoteType !== "EQUITY") return false;
  return /GOLD|SILVER|OIL|CRUDE|BRENT|COMMODITY|METALS|AGRICULTURE|ENERGY/.test(text);
}

function matchFilter(row: SearchAssetItem, filter: { market: string; assetClass: string; region: string }): boolean {
  if (filter.market !== "ALL" && row.market !== filter.market) return false;
  if (filter.assetClass !== "ALL" && row.assetClass !== filter.assetClass) return false;
  if (filter.region !== "ALL" && row.region !== filter.region) return false;
  return true;
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const q = normalizeText(url.searchParams.get("q"));
    if (!q) return fail("VALIDATION_FAILED", "q is required", { status: 400 });

    const limit = clampLimit(url.searchParams.get("limit"));
    const marketFilter = normalizeText(url.searchParams.get("market")).toUpperCase() || "ALL";
    const assetClassFilter = normalizeText(url.searchParams.get("assetClass")).toUpperCase() || "ALL";
    const regionFilter = normalizeText(url.searchParams.get("region")).toUpperCase() || "ALL";
    const system = await getDaaSystemConfig();
    const priceFeedEnabled = system.config.dataSources?.priceFeed?.enabled !== false;
    const cacheConfig = system.config.dataSources?.priceFeed?.marketCache || {
      freshMinutes: 5,
      serveStaleHours: 48,
      rawRetentionDays: 90,
    };

    let payload: unknown;
    try {
      const yahooResult = await getYahooProvider().fetchSearch({
        query: q,
        quotesCount: Math.min(80, limit * 4),
        newsCount: 0,
        enableFuzzyQuery: true,
        timeoutMs: 8_000,
        context: {
          caller: "searchAssetsRoute",
          cacheStatus: "cache_bypass",
        },
      });
      payload = yahooResult.payloadJson;
    } catch (err) {
      return fail("ROUTE_DENIED", "yfinance search upstream error", {
        status: 502,
        details: {
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
    const quotes = safeQuotesArray(payload);

    const out: SearchAssetItem[] = [];
    const dedup = new Set<string>();

    for (const raw of quotes) {
      const row = safeQuote(raw);
      const symbol = normalizeText(row.symbol).toUpperCase();
      if (shouldSkipQuote({ quoteType: row.quoteType, symbol })) continue;
      const exchange = normalizeText(safeString(row.exchange) || safeString(row.exchDisp));
      const market = inferMarket(symbol, exchange);
      const dedupKey = `${market}::${symbol}`;
      if (!symbol || dedup.has(dedupKey)) continue;
      const inferredAssetClass = inferAssetClassByQuoteType({
        quoteType: row.quoteType,
        symbol,
        market,
      });
      const name = normalizeText(safeString(row.shortname) || safeString(row.longname) || symbol) || symbol;
      const displayNameZh = getAssetDisplayName(symbol);
      const shortName = normalizeText(safeString(row.shortname) || symbol);
      const longName = normalizeText(safeString(row.longname) || safeString(row.shortname) || symbol);
      const typeDisp = normalizeText(safeString(row.typeDisp) || safeString(row.quoteType));
      const assetClass = shouldTreatAsCommodity({
        symbol,
        quoteType: normalizeText(safeString(row.quoteType)),
        name,
        shortName,
        longName,
        typeDisp,
      }) ? "COMMODITY" : inferredAssetClass;
      const region = normalizeRegion(row.region, inferRegionByMarket(market));
      const item: SearchAssetItem = {
        symbol,
        market,
        currency: normalizeDaaCurrencyCode(row.currency, market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD"),
        price: toPositive(row.regularMarketPrice) || toPositive(row.postMarketPrice) || toPositive(row.bid) || toPositive(row.ask),
        name,
        displayNameZh,
        shortName,
        longName,
        exchange,
        exchangeDisp: normalizeText(safeString(row.exchDisp) || exchange || market),
        quoteType: normalizeText(safeString(row.quoteType)),
        typeDisp,
        assetClass,
        region,
        instrumentType: inferInstrumentTypeByAssetClass(assetClass),
        marketGroup: inferMarketGroup({ market, assetClass }),
        yfinanceSymbol: toYfinanceSymbolByMarket(symbol, market),
      };

      if (!matchFilter(item, {
        market: marketFilter,
        assetClass: assetClassFilter === "ALL" ? "ALL" : normalizeAssetClass(assetClassFilter, "OTHER"),
        region: regionFilter === "ALL" ? "ALL" : normalizeRegion(regionFilter, "OTHER"),
      })) {
        continue;
      }

      dedup.add(dedupKey);
      out.push(item);
      if (out.length >= limit) break;
    }

    let items = out;
    try {
      items = await enrichPreferredPrice(out, limit, {
        allowRefresh: priceFeedEnabled,
        freshSec: Math.max(60, cacheConfig.freshMinutes * 60),
        serveStaleSec: Math.max(3600, cacheConfig.serveStaleHours * 3600),
        rawRetentionDays: cacheConfig.rawRetentionDays,
      });
    } catch (err) {
      logSwallowed("searchAssetsRoute.enrichItems", err);
      items = out;
    }

    return ok({ items });
  });
}
