import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  buildAccountScopedRequestIdempotencyKey,
  buildUtcCronWindowIdempotencyKey,
  runForEachActiveDaaAccountScope,
  runIdempotentAccountScopedCronJob,
  summarizeAccountScopedCronRuns,
  unwrapSingleAccountCronResult,
} from "@/src/daa/cron/accountCronScope";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { extractDividendsFromRawPayloads } from "@/src/daa/modules/dividend/dividendExtractor";
import { refreshMarketPrices, type MarketPriceAssetInput } from "@/src/daa/modules/marketCache/marketCacheService";
import { getMarketIndicatorRefreshSymbols } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import { WORKBENCH_FEATURED_ASSETS_CATALOG_ } from "@/src/daa/modules/workbench/featuredAssetsCatalog";
import {
  appendAssetPriceHistoryRows,
  getDaaSystemConfig,
  listDaaAssetUniverse,
} from "@/src/daa/store/daaStorePg";
import { batchUpdateDaaAssetUniverseLastPrices } from "@/src/daa/store/assetUniverseStore";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { hasRecentNotification } from "@/src/daa/store/notificationDeliveryLogRepo";
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

    const fallbackKey = buildUtcCronWindowIdempotencyKey("cron_price_refresh", 15);
    const runs = await runForEachActiveDaaAccountScope((scope) =>
      runPriceRefreshJob(req, buildAccountScopedRequestIdempotencyKey(scope, req, fallbackKey)),
    );
    const single = unwrapSingleAccountCronResult(runs);
    return ok(single ?? summarizeAccountScopedCronRuns(runs));
  });
}

async function runPriceRefreshJob(req: Request, idempotencyKey: string | null): Promise<Record<string, unknown>> {
    return runIdempotentAccountScopedCronJob({
      req,
      jobType: "cron_price_refresh",
      triggerSource: "cron_price_refresh",
      idempotencyKey,
      duplicateReason: "当前账号同一 price-refresh 幂等任务已完成，跳过重复触发。",
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

        // P1-3 性能优化：收集待更新项，然后批量 UPDATE（替代 N+1 查询）
        const batchItems: Array<{ assetKey: string; lastPrice: number; priceUpdatedAt: string }> = [];
        const historyRows: Array<{ assetKey: string; ts?: string; price: number; source?: string }> = [];
        for (const row of assetRows) {
          const key = `${normalizeUpper(row.market, "US")}::${normalizeUpper(row.symbol)}`;
          const priced = result.results[key];
          if (!priced || !(priced.price > 0)) continue;
          if (!priced.priceUpdatedAt) continue;
          batchItems.push({
            assetKey: row.assetKey,
            lastPrice: priced.price,
            priceUpdatedAt: priced.priceUpdatedAt,
          });
          historyRows.push({
            assetKey: row.assetKey,
            price: priced.price,
            ts: priced.priceUpdatedAt,
            source: "cron_price_refresh",
          });
        }

        // 单次事务批量更新所有价格
        const refreshedAssetKeys = batchItems.length > 0
          ? await batchUpdateDaaAssetUniverseLastPrices(batchItems)
          : [];

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

        // ── 价格报警检测 ──
        let priceAlertsTriggered = 0;
        try {
          type PriceAlertHit = { symbol: string; alertType: "above" | "below"; price: number; threshold: number };
          type SendablePriceAlertHit = PriceAlertHit & { throttleKey: string };
          const alertHits: PriceAlertHit[] = [];
          for (const row of assetRows) {
            const key = `${normalizeUpper(row.market, "US")}::${normalizeUpper(row.symbol)}`;
            const priced = result.results[key];
            if (!priced || !(priced.price > 0)) continue;

            const above = row.priceAlertAbove;
            const below = row.priceAlertBelow;
            if (typeof above === "number" && above > 0 && priced.price >= above) {
              alertHits.push({ symbol: row.symbol, alertType: "above", price: priced.price, threshold: above });
            }
            if (typeof below === "number" && below > 0 && priced.price <= below) {
              alertHits.push({ symbol: row.symbol, alertType: "below", price: priced.price, threshold: below });
            }
          }

          if (alertHits.length > 0) {
            const sendableHits: SendablePriceAlertHit[] = [];
            for (const hit of alertHits) {
              const throttleKey = `price_alert:${normalizeUpper(hit.symbol)}:${hit.alertType}:${hit.threshold}`;
              const alreadySent = await hasRecentNotification({
                eventType: "price_alert",
                withinMinutes: 24 * 60,
                throttleKey,
              }).catch((err) => {
                logSwallowed("priceRefreshRoute.priceAlertThrottle", err);
                return true;
              });
              if (!alreadySent) sendableHits.push({ ...hit, throttleKey });
            }

            priceAlertsTriggered = sendableHits.length;
            if (sendableHits.length > 0) {
              const alertLines = sendableHits.slice(0, 10).map(
                (h) => `${h.symbol}: ${h.alertType === "above" ? "上穿" : "下穿"} ${h.threshold}（现价 ${h.price.toFixed(2)}）`,
              );
              const throttleKeys = sendableHits.map((hit) => hit.throttleKey);
              const alertMsg = ["DAA 价格报警通知", `触发 ${sendableHits.length} 项`, ...alertLines].join("\n");

              const notif = system.config.notification;
              const sends: Promise<boolean>[] = [];
              if (notif.telegram.enabled) {
                sends.push(sendTelegramByEnv(alertMsg, {
                  eventType: "price_alert",
                  triggerSource: "cron_price_refresh",
                  cycleId: null,
                  requestJson: { alerts: sendableHits.slice(0, 10), throttleKeys },
                }));
              }
              if (notif.feishu.enabled) {
                sends.push(sendFeishuByEnv(alertMsg, {
                  eventType: "price_alert",
                  triggerSource: "cron_price_refresh",
                  cycleId: null,
                  requestJson: { alerts: sendableHits.slice(0, 10), throttleKeys },
                }));
              }
              await Promise.allSettled(sends);
            }
          }
        } catch (err) {
          logSwallowed("priceRefreshRoute.priceAlertCheck", err);
        }

        return {
          requested: targets.length,
          refreshedSymbols: result.refreshed,
          staleSymbols: result.stale,
          missingSymbols: result.missing,
          refreshedAssets: refreshedAssetKeys.length,
          assetKeys: refreshedAssetKeys,
          dividendExtracted,
          priceAlertsTriggered,
          at: new Date().toISOString(),
        };
      },
    });
}
