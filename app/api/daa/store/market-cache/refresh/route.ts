import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { refreshMarketPricesV1, type MarketPriceAssetInputV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { WORKBENCH_FEATURED_ASSETS_CATALOG_V1 } from "@/src/daa/modules/workbench/featuredAssetsCatalogV1";
import { getDaaSystemConfigV2, listDaaAssetUniverseV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

type RefreshBodyV1 = {
  assets?: unknown;
  timeoutMs?: unknown;
  concurrency?: unknown;
  includeFeatured?: unknown;
};

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeUpper(value: unknown, fallback = ""): string {
  return normalizeText(value, fallback).toUpperCase();
}

function inferMarketBySymbolV1(symbolRaw: string): string {
  const symbol = normalizeUpper(symbolRaw);
  if (!symbol) return "US";
  if (symbol.endsWith(".HK")) return "HK";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CN";
  if (symbol.includes("-USD")) return "CRYPTO";
  return "US";
}

function normalizeAssetsInputV1(input: unknown): MarketPriceAssetInputV1[] {
  if (!Array.isArray(input)) return [];
  const out = new Map<string, MarketPriceAssetInputV1>();
  for (const row of input) {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    if (!item) continue;
    const symbol = normalizeUpper(item.symbol);
    const market = normalizeUpper(item.market, inferMarketBySymbolV1(symbol));
    if (!symbol) continue;
    const currency = normalizeUpper(item.currency, market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD");
    const key = `${market}::${symbol}`;
    out.set(key, { symbol, market, currency });
  }
  return [...out.values()];
}

async function buildDefaultTargetsV1(includeFeatured: boolean): Promise<MarketPriceAssetInputV1[]> {
  const [systemRow, rows] = await Promise.all([
    getDaaSystemConfigV2(),
    listDaaAssetUniverseV1(),
  ]);

  const out = new Map<string, MarketPriceAssetInputV1>();
  for (const row of rows) {
    const key = `${row.market}::${row.symbol}`;
    out.set(key, {
      market: row.market,
      symbol: row.symbol,
      currency: row.currency,
    });
  }

  for (const symbol of systemRow.config.dataSources.priceFeed.symbols || []) {
    const normalized = normalizeUpper(symbol);
    if (!normalized) continue;
    const market = inferMarketBySymbolV1(normalized);
    const key = `${market}::${normalized}`;
    if (!out.has(key)) {
      out.set(key, {
        market,
        symbol: normalized,
        currency: market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD",
      });
    }
  }

  if (includeFeatured) {
    for (const row of WORKBENCH_FEATURED_ASSETS_CATALOG_V1) {
      const key = `${row.market}::${normalizeUpper(row.symbol)}`;
      if (out.has(key)) continue;
      out.set(key, {
        market: row.market,
        symbol: normalizeUpper(row.symbol),
        currency: normalizeUpper(row.currency, row.market === "HK" ? "HKD" : row.market === "CN" ? "CNY" : "USD"),
      });
    }
  }

  return [...out.values()];
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<RefreshBodyV1>(req);
    const system = await getDaaSystemConfigV2();
    const cacheConfig = system.config.dataSources.priceFeed.marketCache;
    const includeFeatured = body?.includeFeatured !== false;
    const manualTargets = normalizeAssetsInputV1(body?.assets);
    const targets = manualTargets.length > 0 ? manualTargets : await buildDefaultTargetsV1(includeFeatured);

    if (targets.length <= 0) {
      return failV1("VALIDATION_FAILED", "no price targets", { status: 400 });
    }

    const timeoutMs = Math.max(600, Math.min(8000, Math.trunc(Number(body?.timeoutMs) || 2600)));
    const concurrency = Math.max(1, Math.min(12, Math.trunc(Number(body?.concurrency) || 6)));

    const result = await refreshMarketPricesV1({
      assets: targets,
      triggerSource: "manual_api",
      timeoutMs,
      concurrency,
      rawRetentionDays: cacheConfig.rawRetentionDays,
    });

    return okV1({
      requested: targets.length,
      refreshed: result.refreshed,
      stale: result.stale,
      missing: result.missing,
      at: new Date().toISOString(),
    });
  });
}
