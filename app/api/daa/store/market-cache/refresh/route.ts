import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { refreshMarketPrices, type MarketPriceAssetInput } from "@/src/daa/modules/marketCache/marketCacheService";
import { WORKBENCH_FEATURED_ASSETS_CATALOG_ } from "@/src/daa/modules/workbench/featuredAssetsCatalog";
import { getDaaSystemConfig, listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

type RefreshBody = {
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

function inferMarketBySymbol(symbolRaw: string): string {
  const symbol = normalizeUpper(symbolRaw);
  if (!symbol) return "US";
  if (symbol.endsWith(".HK")) return "HK";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CN";
  if (symbol.includes("-USD")) return "CRYPTO";
  return "US";
}

function normalizeAssetsInput(input: unknown): MarketPriceAssetInput[] {
  if (!Array.isArray(input)) return [];
  const out = new Map<string, MarketPriceAssetInput>();
  for (const row of input) {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    if (!item) continue;
    const symbol = normalizeUpper(item.symbol);
    const market = normalizeUpper(item.market, inferMarketBySymbol(symbol));
    if (!symbol) continue;
    const currency = normalizeUpper(item.currency, market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD");
    const key = `${market}::${symbol}`;
    out.set(key, { symbol, market, currency });
  }
  return [...out.values()];
}

async function buildDefaultTargets(includeFeatured: boolean): Promise<MarketPriceAssetInput[]> {
  const [systemRow, rows] = await Promise.all([
    getDaaSystemConfig(),
    listDaaAssetUniverse(),
  ]);

  const out = new Map<string, MarketPriceAssetInput>();
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
    const market = inferMarketBySymbol(normalized);
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
    for (const row of WORKBENCH_FEATURED_ASSETS_CATALOG_) {
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
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<RefreshBody>(req);
    const system = await getDaaSystemConfig();
    if (system.config.dataSources.priceFeed.enabled === false) {
      return fail("VALIDATION_FAILED", "priceFeed is disabled", {
        status: 409,
        details: { code: "PRICE_FEED_DISABLED" },
      });
    }
    const cacheConfig = system.config.dataSources.priceFeed.marketCache;
    const includeFeatured = body?.includeFeatured !== false;
    const manualTargets = normalizeAssetsInput(body?.assets);
    const targets = manualTargets.length > 0 ? manualTargets : await buildDefaultTargets(includeFeatured);

    if (targets.length <= 0) {
      return fail("VALIDATION_FAILED", "no price targets", { status: 400 });
    }

    const timeoutMs = Math.max(600, Math.min(8000, Math.trunc(Number(body?.timeoutMs) || 2600)));
    const concurrency = Math.max(1, Math.min(12, Math.trunc(Number(body?.concurrency) || 6)));

    const result = await refreshMarketPrices({
      assets: targets,
      triggerSource: "manual_api",
      timeoutMs,
      concurrency,
      rawRetentionDays: cacheConfig.rawRetentionDays,
    });

    return ok({
      requested: targets.length,
      refreshed: result.refreshed,
      stale: result.stale,
      missing: result.missing,
      at: new Date().toISOString(),
    });
  });
}
