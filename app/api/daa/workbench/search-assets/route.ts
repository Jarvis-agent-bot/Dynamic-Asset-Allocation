import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import {
  inferAssetClassByQuoteTypeV1,
  inferInstrumentTypeByAssetClassV1,
  inferMarketGroupV1,
  inferRegionByMarketV1,
  normalizeAssetClassV1,
  normalizeRegionV1,
} from "@/src/daa/modules/workbench/assetTaxonomyV1";
import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { normalizeDaaCurrencyCodeV1 } from "@/src/daa/assetKeyV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";
import { toYfinanceSymbolByMarketV1 } from "@/src/market/yfinanceSymbolV1";

type LookupMarket = "US" | "HK" | "CN" | "CRYPTO" | "OTHER";

type SearchAssetItemV1 = {
  symbol: string;
  market: LookupMarket;
  currency: string;
  price: number;
  priceStatus?: "fresh" | "stale" | "missing";
  priceUpdatedAt?: string | null;
  priceSource?: string;
  priceAgeSec?: number | null;
  name: string;
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

function normalizeText(v: unknown): string {
  return String(v || "").trim();
}

function clampLimit(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 15;
  return Math.max(1, Math.min(SEARCH_LIMIT_MAX, Math.trunc(n)));
}

function toPositive(...values: unknown[]): number {
  for (const raw of values) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function shouldSkipQuoteTypeV1(quoteTypeRaw: unknown): boolean {
  const quoteType = normalizeText(quoteTypeRaw).toUpperCase();
  if (!quoteType) return false;
  if (quoteType === "OPTION") return true;
  if (quoteType === "FUTURE") return true;
  if (quoteType === "WARRANT") return true;
  return false;
}

async function enrichPreferredPriceV1(
  items: SearchAssetItemV1[],
  maxFetch = 10,
  opts: { freshSec: number; serveStaleSec: number; rawRetentionDays: number },
): Promise<SearchAssetItemV1[]> {
  if (items.length <= 0) return items;
  const refreshTargets = items.filter((item) => item.yfinanceSymbol).slice(0, Math.max(1, Math.trunc(maxFetch)));
  if (refreshTargets.length <= 0) return items;

  const priced = await getMarketPricesWithCacheV1({
    assets: refreshTargets.map((item) => ({
      symbol: item.symbol,
      market: item.market,
      currency: item.currency,
    })),
    allowRefresh: true,
    forceRefresh: true,
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
  if (symbol.includes("-USD")) return "CRYPTO";
  if (symbol.endsWith(".HK") || exchange.includes("HK") || exchange.includes("HONG KONG")) return "HK";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ") || exchange.includes("SHANGHAI") || exchange.includes("SHENZHEN") || exchange.includes("SSE")) return "CN";
  if (exchange.includes("NYSE") || exchange.includes("NASDAQ") || exchange.includes("AMEX") || exchange.includes("ARCA") || exchange.includes("NMS")) return "US";
  if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol) && !symbol.includes(".")) return "US";
  return "OTHER";
}

const COMMODITY_ETF_SYMBOLS_V1 = new Set(["GLD", "IAU", "SLV", "USO", "BNO", "DBC", "DBA"]);

function shouldTreatAsCommodityV1(input: {
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
  if (COMMODITY_ETF_SYMBOLS_V1.has(symbol)) return true;
  if (quoteType !== "ETF" && quoteType !== "EQUITY") return false;
  return /GOLD|SILVER|OIL|CRUDE|BRENT|COMMODITY|METALS|AGRICULTURE|ENERGY/.test(text);
}

function matchFilter(row: SearchAssetItemV1, filter: { market: string; assetClass: string; region: string }): boolean {
  if (filter.market !== "ALL" && row.market !== filter.market) return false;
  if (filter.assetClass !== "ALL" && row.assetClass !== filter.assetClass) return false;
  if (filter.region !== "ALL" && row.region !== filter.region) return false;
  return true;
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const q = normalizeText(url.searchParams.get("q"));
    if (!q) return failV1("VALIDATION_FAILED", "q is required", { status: 400 });

    const limit = clampLimit(url.searchParams.get("limit"));
    const marketFilter = normalizeText(url.searchParams.get("market")).toUpperCase() || "ALL";
    const assetClassFilter = normalizeText(url.searchParams.get("assetClass")).toUpperCase() || "ALL";
    const regionFilter = normalizeText(url.searchParams.get("region")).toUpperCase() || "ALL";
    const system = await getDaaSystemConfigV2();
    const cacheConfig = system.config.dataSources?.priceFeed?.marketCache || {
      freshMinutes: 15,
      serveStaleHours: 48,
      rawRetentionDays: 90,
    };

    const upstream = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    upstream.searchParams.set("q", q);
    upstream.searchParams.set("quotesCount", String(Math.min(80, limit * 4)));
    upstream.searchParams.set("newsCount", "0");
    upstream.searchParams.set("enableFuzzyQuery", "true");

    const response = await fetch(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; DAA/0.1; +https://example.invalid)",
      },
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) {
      return failV1("ROUTE_DENIED", "yfinance search upstream error", {
        status: 502,
        details: { status: response.status, body: text.slice(0, 1000) },
      });
    }

    const payload = JSON.parse(text) as Record<string, unknown>;
    const quotes = Array.isArray((payload as any)?.quotes) ? (payload as any).quotes : [];

    const out: SearchAssetItemV1[] = [];
    const dedup = new Set<string>();

    for (const row of quotes) {
      const symbol = normalizeText((row as any)?.symbol).toUpperCase();
      if (shouldSkipQuoteTypeV1((row as any)?.quoteType)) continue;
      const exchange = normalizeText((row as any)?.exchange || (row as any)?.exchDisp);
      const market = inferMarket(symbol, exchange);
      const dedupKey = `${market}::${symbol}`;
      if (!symbol || dedup.has(dedupKey)) continue;
      const inferredAssetClass = inferAssetClassByQuoteTypeV1({
        quoteType: (row as any)?.quoteType,
        symbol,
        market,
      });
      const name = normalizeText((row as any)?.shortname || (row as any)?.longname || symbol) || symbol;
      const shortName = normalizeText((row as any)?.shortname || symbol);
      const longName = normalizeText((row as any)?.longname || (row as any)?.shortname || symbol);
      const typeDisp = normalizeText((row as any)?.typeDisp || (row as any)?.quoteType || "");
      const assetClass = shouldTreatAsCommodityV1({
        symbol,
        quoteType: normalizeText((row as any)?.quoteType || ""),
        name,
        shortName,
        longName,
        typeDisp,
      }) ? "COMMODITY" : inferredAssetClass;
      const region = normalizeRegionV1((row as any)?.region, inferRegionByMarketV1(market));
      const item: SearchAssetItemV1 = {
        symbol,
        market,
        currency: normalizeDaaCurrencyCodeV1((row as any)?.currency, market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD"),
        price: toPositive((row as any)?.regularMarketPrice, (row as any)?.postMarketPrice, (row as any)?.bid, (row as any)?.ask),
        name,
        shortName,
        longName,
        exchange,
        exchangeDisp: normalizeText((row as any)?.exchDisp || exchange || market),
        quoteType: normalizeText((row as any)?.quoteType || ""),
        typeDisp,
        assetClass,
        region,
        instrumentType: inferInstrumentTypeByAssetClassV1(assetClass),
        marketGroup: inferMarketGroupV1({ market, assetClass }),
        yfinanceSymbol: toYfinanceSymbolByMarketV1(symbol, market),
      };

      if (!matchFilter(item, {
        market: marketFilter,
        assetClass: assetClassFilter === "ALL" ? "ALL" : normalizeAssetClassV1(assetClassFilter, "OTHER"),
        region: regionFilter === "ALL" ? "ALL" : normalizeRegionV1(regionFilter, "OTHER"),
      })) {
        continue;
      }

      dedup.add(dedupKey);
      out.push(item);
      if (out.length >= limit) break;
    }

    let items = out;
    try {
      items = await enrichPreferredPriceV1(out, limit, {
        freshSec: Math.max(60, cacheConfig.freshMinutes * 60),
        serveStaleSec: Math.max(3600, cacheConfig.serveStaleHours * 3600),
        rawRetentionDays: cacheConfig.rawRetentionDays,
      });
    } catch {
      items = out;
    }

    return okV1({ items });
  });
}
