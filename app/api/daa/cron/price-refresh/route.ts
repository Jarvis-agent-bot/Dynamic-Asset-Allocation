import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { extractDividendsFromRawPayloads } from "@/src/daa/modules/dividend/dividendExtractor";
import { refreshMarketPrices, type MarketPriceAssetInput } from "@/src/daa/modules/marketCache/marketCacheService";
import { getMarketIndicatorRefreshSymbols } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import { WORKBENCH_FEATURED_ASSETS_CATALOG_ } from "@/src/daa/modules/workbench/featuredAssetsCatalog";
import {
  appendAssetPriceHistoryRows,
  getDaaSystemConfig,
  listDaaAssetUniverse,
  updateDaaAssetUniverseLastPrice,
} from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

function normalizeUpper(value: unknown, fallback = ""): string {
  const text = String(value || "").trim().toUpperCase();
  return text || fallback;
}

function inferMarketBySymbol(symbolRaw: string): string {
  const symbol = normalizeUpper(symbolRaw);
  if (!symbol) return "US";
  if (symbol.endsWith(".HK")) return "HK";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CN";
  if (symbol.includes("-USD")) return "CRYPTO";
  return "US";
}

function dedupeTargets(rows: MarketPriceAssetInput[]): MarketPriceAssetInput[] {
  const out = new Map<string, MarketPriceAssetInput>();
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
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const execution = await runLoggedJob({
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
        const [system, assetRows] = await Promise.all([getDaaSystemConfig(), listDaaAssetUniverse()]);
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

        const targets = dedupeTargets([
          ...assetRows.map((row) => ({
            market: row.market,
            symbol: row.symbol,
            currency: row.currency,
          })),
          ...(system.config.dataSources.priceFeed.symbols || []).map((symbol) => {
            const market = inferMarketBySymbol(symbol);
            return {
              market,
              symbol: normalizeUpper(symbol),
              currency: market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD",
            };
          }),
          ...WORKBENCH_FEATURED_ASSETS_CATALOG_.map((row) => ({
            market: row.market,
            symbol: row.symbol,
            currency: row.currency,
          })),
          ...getMarketIndicatorRefreshSymbols(system.config.dataSources.marketIndicators).map((symbol) => {
            const market = inferMarketBySymbol(symbol);
            return {
              market,
              symbol: normalizeUpper(symbol),
              currency: market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD",
            };
          }),
        ]);

        const result = await refreshMarketPrices({
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
          const updated = await updateDaaAssetUniverseLastPrice({
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
          await appendAssetPriceHistoryRows(historyRows);
        }

        // Extract dividends from raw payloads stored during this refresh (last 10 days window)
        let dividendExtracted = 0;
        try {
          const divResult = await extractDividendsFromRawPayloads({ sinceDays: 1 });
          dividendExtracted = divResult.extracted;
        } catch (err) {
  logSwallowed("priceRefreshRoute.dividendExtraction", err);
        }

        return {
          requested: targets.length,
          refreshedSymbols: result.refreshed,
          staleSymbols: result.stale,
          missingSymbols: result.missing,
          refreshedAssets: refreshedAssetKeys.length,
          assetKeys: refreshedAssetKeys,
          dividendExtracted,
          at: new Date().toISOString(),
        };
      },
    });

    return ok({
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
