import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import {
  appendDaaExternalPayloadRaw,
  appendDaaFxRateHistoryRows,
  appendDaaIngestJobLog,
  getDaaSystemConfig,
  listDaaAssetUniverse,
  listDaaFxRates,
  upsertDaaFxRates,
} from "@/src/daa/store/daaStorePg";

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
};

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

function extractHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
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
    };
  }

  const symbol = `${baseCcy}${quoteCcy}=X`;
  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set("interval", "1d");
  upstream.searchParams.set("range", "5d");

  const response = await fetch(upstream, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; DAA/0.1; +https://example.invalid)",
    },
    cache: "no-store",
  });

  const raw = await response.text();
  let payloadJson: Record<string, unknown> | null = null;
  try {
    payloadJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    payloadJson = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      rate: 0,
      status: response.status,
      errorCode: `http_${response.status}`,
      errorMessage: `FX upstream error(${response.status}) for ${baseCcy}/${quoteCcy}`,
      payloadJson,
      payloadText: raw,
      responseHeadersJson: extractHeaders(response.headers),
    };
  }

  const chartError = (payloadJson as any)?.chart?.error;
  if (chartError) {
    return {
      ok: false,
      rate: 0,
      status: 200,
      errorCode: String(chartError?.code || "chart_error"),
      errorMessage: `FX chart error for ${baseCcy}/${quoteCcy}`,
      payloadJson,
      payloadText: raw,
      responseHeadersJson: extractHeaders(response.headers),
    };
  }

  const result = (payloadJson as any)?.chart?.result?.[0];
  const metaPrice = Number(result?.meta?.regularMarketPrice);
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
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
      payloadText: raw,
      responseHeadersJson: extractHeaders(response.headers),
    };
  }

  return {
    ok: true,
    rate,
    status: response.status,
    errorCode: null,
    errorMessage: null,
    payloadJson,
    payloadText: raw,
    responseHeadersJson: extractHeaders(response.headers),
  };
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

    const strategyBase = normalizeCcy((system.config.strategy?.account as any)?.baseCurrency, "USD");
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

    if (fxPairs.length === 0) {
      const finishedAt = new Date().toISOString();
      await appendDaaIngestJobLog({
        jobType: "cron_fx_refresh",
        triggerSource: "cron_fx_refresh",
        status: "ok",
        startedAt: finishedAt,
        finishedAt,
        totalCount: 0,
        successCount: 0,
        failureCount: 0,
        diagnosticsJson: { reason: "no_pairs" },
      });
      return ok({
        updatedPairs: [],
        skippedPairs: [],
        failures: [],
        at: finishedAt,
      });
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
          requestUrl: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(`${pair.baseCcy}${pair.quoteCcy}=X`)}`,
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
      } catch {
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

    await appendDaaIngestJobLog({
      jobType: "cron_fx_refresh",
      triggerSource: "cron_fx_refresh",
      status: failures.length <= 0 ? "ok" : updatedPairs.length > 0 ? "partial" : "failed",
      startedAt: nowIso,
      finishedAt: new Date().toISOString(),
      totalCount: fxPairs.length,
      successCount: updatedPairs.length,
      failureCount: failures.length,
      diagnosticsJson: {
        skippedCount: skippedPairs.length,
      },
    });

    return ok({
      updatedPairs,
      skippedPairs,
      failures,
      at: nowIso,
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
