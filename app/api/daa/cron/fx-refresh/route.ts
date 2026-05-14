import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import {
  appendDaaExternalPayloadRaw,
  appendDaaFxRateHistoryRows,
  getDaaSystemConfig,
  listDaaAssetUniverse,
  listDaaFxRates,
  upsertDaaFxRates,
} from "@/src/daa/store/daaStorePg";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { getYahooProvider } from "@/src/market/yahooProvider";

export const runtime = "nodejs";

type NormalizedFxPair = {
  baseCcy: string;
  quoteCcy: string;
  pair: string;
};

type FxFetchResult = {
  ok: boolean;
  rate: number;
  status: number;
  errorCode: string | null;
  errorMessage: string | null;
  payloadJson: Record<string, unknown> | null;
  payloadText: string;
  responseHeadersJson: Record<string, string>;
  requestUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCcy(value: unknown, fallback = "USD"): string {
  const ccy = String(value || "").trim().toUpperCase();
  if (!ccy) return fallback;
  if (ccy === "RMB" || ccy === "CNH") return "CNY";
  return ccy;
}

function normalizePairToken(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "/");
}

function buildPair(baseCcy: string, quoteCcy: string): NormalizedFxPair {
  const base = normalizeCcy(baseCcy, "USD");
  const quote = normalizeCcy(quoteCcy, "USD");
  return {
    baseCcy: base,
    quoteCcy: quote,
    pair: `${base}/${quote}`,
  };
}

function toFxPairsFromConfig(input: { enabled: boolean; baseCurrency: string; pairs: unknown }): NormalizedFxPair[] {
  if (!input.enabled) return [];

  const baseCurrency = normalizeCcy(input.baseCurrency, "USD");
  const pairsRaw = input.pairs;
  const tokens = Array.isArray(pairsRaw)
    ? pairsRaw
    : typeof pairsRaw === "string"
      ? pairsRaw.split(/[\s,，;；\n]+/g)
      : [];

  const out = new Map<string, NormalizedFxPair>();
  for (const raw of tokens) {
    const token = normalizePairToken(raw);
    if (!token) continue;
    if (/^[A-Z]{3}\/[A-Z]{3}$/.test(token)) {
      const [base, quote] = token.split("/");
      const pair = buildPair(base, quote);
      out.set(pair.pair, pair);
      continue;
    }
    if (/^[A-Z]{3}$/.test(token)) {
      const pair = buildPair(baseCurrency, token);
      out.set(pair.pair, pair);
    }
  }
  return [...out.values()];
}

function toFxPairsFromAssets(
  baseCurrency: string,
  rows: Array<{ currency: string; holdingQty: number; watchEnabled: boolean }>,
): NormalizedFxPair[] {
  const base = normalizeCcy(baseCurrency, "USD");
  const out = new Map<string, NormalizedFxPair>();

  for (const row of rows) {
    if (!(row.holdingQty > 0) && row.watchEnabled === false) continue;
    const quote = normalizeCcy(row.currency, base);
    if (!quote || quote === base) continue;
    const pair = buildPair(base, quote);
    out.set(pair.pair, pair);
  }

  return [...out.values()];
}

function mergeFxPairs(...groups: NormalizedFxPair[][]): NormalizedFxPair[] {
  const out = new Map<string, NormalizedFxPair>();
  for (const rows of groups) {
    for (const pair of rows) out.set(pair.pair, pair);
  }
  return [...out.values()];
}

function toShanghaiDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toBusinessDay(value: unknown): string {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return "";
  return toShanghaiDay(new Date(ms));
}

function pickLatestPositive(values: unknown[]): number {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const n = Number(values[i]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

async function fetchYfinanceFxRate(baseCcy: string, quoteCcy: string): Promise<FxFetchResult> {
  if (baseCcy === quoteCcy) {
    return {
      ok: true,
      rate: 1,
      status: 200,
      errorCode: null,
      errorMessage: null,
      payloadJson: null,
      payloadText: "",
      responseHeadersJson: {},
      requestUrl: "",
    };
  }

  const symbol = `${baseCcy}${quoteCcy}=X`;
  try {
    const yahooResult = await getYahooProvider().fetchChart({
      symbol,
      interval: "1d",
      range: "5d",
      timeoutMs: 8_000,
      context: {
        caller: "fxRefreshRoute.fetchFxRate",
        cacheStatus: "cache_bypass",
      },
    });
    const payloadJson = yahooResult.payloadJson as Record<string, unknown>;
    const chart = payloadJson && isRecord(payloadJson.chart) ? payloadJson.chart : {};
    const chartError = isRecord(chart.error) ? chart.error : null;
    if (chartError) {
      return {
        ok: false,
        rate: 0,
        status: 200,
        errorCode: String(chartError?.code || "chart_error"),
        errorMessage: `FX chart error for ${baseCcy}/${quoteCcy}`,
        payloadJson,
        payloadText: yahooResult.payloadText,
        responseHeadersJson: yahooResult.responseHeaders,
        requestUrl: yahooResult.url,
      };
    }

    const resultRows = Array.isArray(chart.result) ? chart.result : [];
    const result = isRecord(resultRows[0]) ? resultRows[0] : {};
    const meta = isRecord(result.meta) ? result.meta : {};
    const indicators = isRecord(result.indicators) ? result.indicators : {};
    const quoteRows = Array.isArray(indicators.quote) ? indicators.quote : [];
    const firstQuote = isRecord(quoteRows[0]) ? quoteRows[0] : {};
    const metaPrice = Number(meta.regularMarketPrice);
    const closes = Array.isArray(firstQuote.close) ? firstQuote.close : [];
    const closePrice = pickLatestPositive(closes);
    const rate = metaPrice > 0 ? metaPrice : closePrice;

    if (!Number.isFinite(rate) || rate <= 0) {
      return {
        ok: false,
        rate: 0,
        status: 200,
        errorCode: "rate_missing",
        errorMessage: `FX rate missing for ${baseCcy}/${quoteCcy}`,
        payloadJson,
        payloadText: yahooResult.payloadText,
        responseHeadersJson: yahooResult.responseHeaders,
        requestUrl: yahooResult.url,
      };
    }

    return {
      ok: true,
      rate,
      status: yahooResult.status,
      errorCode: null,
      errorMessage: null,
      payloadJson,
      payloadText: yahooResult.payloadText,
      responseHeadersJson: yahooResult.responseHeaders,
      requestUrl: yahooResult.url,
    };
  } catch (err) {
    return {
      ok: false,
      rate: 0,
      status: err instanceof Error && "status" in err ? Number((err as { status?: unknown }).status) || 0 : 0,
      errorCode: err instanceof Error && "errorCode" in err ? String((err as { errorCode?: unknown }).errorCode || "fetch_failed") : "fetch_failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      payloadJson: null,
      payloadText: err instanceof Error && "bodyPreview" in err ? String((err as { bodyPreview?: unknown }).bodyPreview || "") : "",
      responseHeadersJson: {},
      requestUrl: err instanceof Error && "url" in err ? String((err as { url?: unknown }).url || "") : "",
    };
  }
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const [system, assetRows, existingRates] = await Promise.all([
      getDaaSystemConfig(),
      listDaaAssetUniverse(),
      listDaaFxRates(),
    ]);

    const strategyBase = normalizeCcy(system.config.strategy.account.baseCurrency, "USD");
    const fxFeed = system.config.dataSources.fxFeed;
    const rawRetentionDays = Math.max(7, Math.min(365, Math.trunc(system.config.dataSources.priceFeed.marketCache.rawRetentionDays || 90)));
    const fxPairs = mergeFxPairs(
      toFxPairsFromConfig({
        enabled: fxFeed.enabled !== false,
        baseCurrency: fxFeed.baseCurrency || strategyBase,
        pairs: fxFeed.pairs,
      }),
      toFxPairsFromAssets(strategyBase, assetRows),
    );

    const execution = await runLoggedJob({
      req,
      jobType: "cron_fx_refresh",
      triggerSource: "cron_fx_refresh",
      handler: async () => {
        if (fxPairs.length === 0) {
          return { updatedPairs: [] as string[], skippedPairs: [] as string[], failures: [] as string[], at: new Date().toISOString() };
        }

        const nowIso = new Date().toISOString();
        const today = toShanghaiDay(new Date(nowIso));
        const existingByPair = new Map(existingRates.map((row) => [
          `${normalizeCcy(row.baseCcy)}/${normalizeCcy(row.quoteCcy)}`,
          row,
        ]));

        const rowsToUpsert: Array<{ baseCcy: string; quoteCcy: string; rate: number; source: string; asOfTs: string }> = [];
        const fxHistoryRows: Array<{
          provider: string;
          baseCcy: string;
          quoteCcy: string;
          asOfTs: string;
          rate: number;
          status: "fresh" | "error";
          fetchedAt: string;
          errorCode?: string | null;
          errorMessage?: string | null;
          rawRefId?: string | null;
        }> = [];
        const updatedPairs: string[] = [];
        const skippedPairs: string[] = [];
        const failures: string[] = [];

        for (const pair of fxPairs) {
          if (toBusinessDay(existingByPair.get(pair.pair)?.asOfTs) === today) {
            skippedPairs.push(pair.pair);
            continue;
          }

          const fetchResult = await fetchYfinanceFxRate(pair.baseCcy, pair.quoteCcy);
          let rawRefId: string | null = null;
          if (fetchResult.payloadJson || fetchResult.payloadText) try {
            const raw = await appendDaaExternalPayloadRaw({
              provider: "yfinance",
              resource: "yfinance.fx.chart",
              subjectKey: pair.pair,
              requestUrl: fetchResult.requestUrl || `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(`${pair.baseCcy}${pair.quoteCcy}=X`)}`,
              requestJson: {
                baseCcy: pair.baseCcy,
                quoteCcy: pair.quoteCcy,
                pair: pair.pair,
              },
              responseStatus: fetchResult.status,
              responseHeadersJson: fetchResult.responseHeadersJson,
              payloadJson: fetchResult.payloadJson,
              payloadText: fetchResult.payloadText || null,
              fetchedAt: nowIso,
              expireAt: new Date(Date.now() + rawRetentionDays * 24 * 3600 * 1000).toISOString(),
            });
            rawRefId = raw.id;
          } catch (err) {
            logSwallowed("fxRefreshRoute.appendRaw", err);
            rawRefId = null;
          }

          if (fetchResult.ok) {
            rowsToUpsert.push({
              baseCcy: pair.baseCcy,
              quoteCcy: pair.quoteCcy,
              rate: fetchResult.rate,
              source: "cron_daily_pull",
              asOfTs: nowIso,
            });
            fxHistoryRows.push({
              provider: "yfinance",
              baseCcy: pair.baseCcy,
              quoteCcy: pair.quoteCcy,
              asOfTs: nowIso,
              rate: fetchResult.rate,
              status: "fresh",
              fetchedAt: nowIso,
              rawRefId,
            });
            updatedPairs.push(pair.pair);
          } else {
            failures.push(`${pair.pair}:${fetchResult.errorMessage || fetchResult.errorCode || "unknown"}`);
            fxHistoryRows.push({
              provider: "yfinance",
              baseCcy: pair.baseCcy,
              quoteCcy: pair.quoteCcy,
              asOfTs: nowIso,
              rate: 0,
              status: "error",
              fetchedAt: nowIso,
              errorCode: fetchResult.errorCode,
              errorMessage: fetchResult.errorMessage,
              rawRefId,
            });
          }
        }

        if (rowsToUpsert.length > 0) {
          await upsertDaaFxRates(rowsToUpsert);
        }
        if (fxHistoryRows.length > 0) {
          await appendDaaFxRateHistoryRows(fxHistoryRows);
        }

        return { updatedPairs, skippedPairs, failures, at: nowIso };
      },
      summarize: (result) => ({
        totalCount: fxPairs.length,
        successCount: result.updatedPairs.length,
        failureCount: result.failures.length,
        skippedCount: result.skippedPairs.length,
      }),
    });

    return ok({ ...execution.result, jobId: execution.jobId });
  });
}
