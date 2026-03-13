import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { runLoggedJobV1 } from "@/src/daa/jobs/jobServiceV1";
import { refreshMarketPricesV1, type MarketPriceAssetInputV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { getMarketIndicatorRefreshSymbolsV1 } from "@/src/daa/modules/marketContext/marketIndicatorCatalogV1";
import { WORKBENCH_FEATURED_ASSETS_CATALOG_V1 } from "@/src/daa/modules/workbench/featuredAssetsCatalogV1";
import {
  appendAssetPriceHistoryRowsV1,
  getDaaSystemConfigV2,
  listDaaAssetUniverseV1,
  updateDaaAssetUniverseLastPriceV1,
} from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

function normalizeUpper(value: unknown, fallback = ""): string {
  const text = String(value || "").trim().toUpperCase();
  return text || fallback;
}

function inferMarketBySymbolV1(symbolRaw: string): string {
  const symbol = normalizeUpper(symbolRaw);
  if (!symbol) return "US";
  if (symbol.endsWith(".HK")) return "HK";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CN";
  if (symbol.includes("-USD")) return "CRYPTO";
  return "US";
}

function dedupeTargetsV1(rows: MarketPriceAssetInputV1[]): MarketPriceAssetInputV1[] {
  const out = new Map<string, MarketPriceAssetInputV1>();
  for (const row of rows) {
    const market = normalizeUpper(row.market, "US");
    const symbol = normalizeUpper(row.symbol);
    if (!symbol) continue;
    const key = `${market}::${symbol}`;
    if (!out.has(key)) {
      out.set(key, {
        market,
        symbol,
        currency: normalizeUpper(row.currency, market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD"),
      });
    }
  }
  return [...out.values()];
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const execution = await runLoggedJobV1({
      req,
      jobType: "cron_price_refresh",
      triggerSource: "cron_price_refresh",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (result) => ({
        requested: result.requested,
        refreshedSymbols: result.refreshedSymbols,
        staleSymbols: result.staleSymbols,
        missingSymbols: result.missingSymbols,
        refreshedAssets: result.refreshedAssets,
      }),
      handler: async () => {
        const [system, assetRows] = await Promise.all([getDaaSystemConfigV2(), listDaaAssetUniverseV1()]);
        const priceFeed = system.config.dataSources.priceFeed;
        if (priceFeed.enabled === false) {
          return {
            requested: 0,
            refreshedSymbols: 0,
            staleSymbols: 0,
            missingSymbols: 0,
            refreshedAssets: 0,
            assetKeys: [],
            at: new Date().toISOString(),
            skipped: true,
            reason: "PRICE_FEED_DISABLED",
          };
        }
        const marketCache = priceFeed.marketCache;

        const targets = dedupeTargetsV1([
          ...assetRows.map((row) => ({
            market: row.market,
            symbol: row.symbol,
            currency: row.currency,
          })),
          ...(system.config.dataSources.priceFeed.symbols || []).map((symbol) => {
            const market = inferMarketBySymbolV1(symbol);
            return {
              market,
              symbol: normalizeUpper(symbol),
              currency: market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD",
            };
          }),
          ...WORKBENCH_FEATURED_ASSETS_CATALOG_V1.map((row) => ({
            market: row.market,
            symbol: row.symbol,
            currency: row.currency,
          })),
          ...getMarketIndicatorRefreshSymbolsV1(system.config.dataSources.marketIndicators).map((symbol) => {
            const market = inferMarketBySymbolV1(symbol);
            return {
              market,
              symbol: normalizeUpper(symbol),
              currency: market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD",
            };
          }),
        ]);

        const result = await refreshMarketPricesV1({
          assets: targets,
          triggerSource: "cron_price_refresh",
          timeoutMs: 2600,
          concurrency: 6,
          rawRetentionDays: marketCache.rawRetentionDays,
        });

        const refreshedAssetKeys: string[] = [];
        const historyRows: Array<{ assetKey: string; ts?: string; price: number; source?: string }> = [];
        for (const row of assetRows) {
          const key = `${normalizeUpper(row.market, "US")}::${normalizeUpper(row.symbol)}`;
          const priced = result.results[key];
          if (!priced || !(priced.price > 0)) continue;
          if (!priced.priceUpdatedAt) continue;
          const updatedAt = priced.priceUpdatedAt;
          const updated = await updateDaaAssetUniverseLastPriceV1({
            assetKey: row.assetKey,
            lastPrice: priced.price,
            priceUpdatedAt: updatedAt,
          });
          if (!updated) continue;
          refreshedAssetKeys.push(updated.assetKey);
          historyRows.push({
            assetKey: updated.assetKey,
            price: priced.price,
            ts: updatedAt,
            source: "cron_price_refresh",
          });
        }

        if (historyRows.length > 0) {
          await appendAssetPriceHistoryRowsV1(historyRows);
        }

        return {
          requested: targets.length,
          refreshedSymbols: result.refreshed,
          staleSymbols: result.stale,
          missingSymbols: result.missing,
          refreshedAssets: refreshedAssetKeys.length,
          assetKeys: refreshedAssetKeys,
          at: new Date().toISOString(),
        };
      },
    });

    return okV1({
      ...execution.result,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
