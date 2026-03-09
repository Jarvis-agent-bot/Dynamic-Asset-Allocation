import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import {
  appendDaaExternalPayloadRawV1,
  appendDaaFxRateHistoryRowsV1,
  appendDaaIngestJobLogV1,
  getDaaSystemConfigV2,
  listDaaAssetUniverseV1,
  listDaaFxRatesV1,
  upsertDaaFxRatesV1,
} from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

type NormalizedFxPairV1 = {
  baseCcy: string;
  quoteCcy: string;
  pair: string;
};

type FxFetchResultV1 = {
  ok: boolean;
  rate: number;
  status: number;
  errorCode: string | null;
  errorMessage: string | null;
  payloadJson: Record<string, unknown> | null;
  payloadText: string;
  responseHeadersJson: Record<string, string>;
};

function normalizeCcyV1(value: unknown, fallback = "USD"): string {
  const ccy = String(value || "").trim().toUpperCase();
  if (!ccy) return fallback;
  if (ccy === "RMB" || ccy === "CNH") return "CNY";
  return ccy;
}

function normalizePairTokenV1(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "/");
}

function buildPairV1(baseCcy: string, quoteCcy: string): NormalizedFxPairV1 {
  const base = normalizeCcyV1(baseCcy, "USD");
  const quote = normalizeCcyV1(quoteCcy, "USD");
  return {
    baseCcy: base,
    quoteCcy: quote,
    pair: `${base}/${quote}`,
  };
}

function toFxPairsFromConfigV1(input: { enabled: boolean; baseCurrency: string; pairs: unknown }): NormalizedFxPairV1[] {
  if (!input.enabled) return [];

  const baseCurrency = normalizeCcyV1(input.baseCurrency, "USD");
  const pairsRaw = input.pairs;
  const tokens = Array.isArray(pairsRaw)
    ? pairsRaw
    : typeof pairsRaw === "string"
      ? pairsRaw.split(/[\s,，;；\n]+/g)
      : [];

  const out = new Map<string, NormalizedFxPairV1>();
  for (const raw of tokens) {
    const token = normalizePairTokenV1(raw);
    if (!token) continue;
    if (/^[A-Z]{3}\/[A-Z]{3}$/.test(token)) {
      const [base, quote] = token.split("/");
      const pair = buildPairV1(base, quote);
      out.set(pair.pair, pair);
      continue;
    }
    if (/^[A-Z]{3}$/.test(token)) {
      const pair = buildPairV1(baseCurrency, token);
      out.set(pair.pair, pair);
    }
  }
  return [...out.values()];
}

function toFxPairsFromAssetsV1(
  baseCurrency: string,
  rows: Array<{ currency: string; holdingQty: number; watchEnabled: boolean }>,
): NormalizedFxPairV1[] {
  const base = normalizeCcyV1(baseCurrency, "USD");
  const out = new Map<string, NormalizedFxPairV1>();

  for (const row of rows) {
    if (!(row.holdingQty > 0) && row.watchEnabled === false) continue;
    const quote = normalizeCcyV1(row.currency, base);
    if (!quote || quote === base) continue;
    const pair = buildPairV1(base, quote);
    out.set(pair.pair, pair);
  }

  return [...out.values()];
}

function mergeFxPairsV1(...groups: NormalizedFxPairV1[][]): NormalizedFxPairV1[] {
  const out = new Map<string, NormalizedFxPairV1>();
  for (const rows of groups) {
    for (const pair of rows) out.set(pair.pair, pair);
  }
  return [...out.values()];
}

function toShanghaiDayV1(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toBusinessDayV1(value: unknown): string {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return "";
  return toShanghaiDayV1(new Date(ms));
}

function pickLatestPositiveV1(values: unknown[]): number {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const n = Number(values[i]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function extractHeadersV1(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function fetchYfinanceFxRateV1(baseCcy: string, quoteCcy: string): Promise<FxFetchResultV1> {
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
      responseHeadersJson: extractHeadersV1(response.headers),
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
      responseHeadersJson: extractHeadersV1(response.headers),
    };
  }

  const result = (payloadJson as any)?.chart?.result?.[0];
  const metaPrice = Number(result?.meta?.regularMarketPrice);
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
  const closePrice = pickLatestPositiveV1(closes);
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
      responseHeadersJson: extractHeadersV1(response.headers),
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
    responseHeadersJson: extractHeadersV1(response.headers),
  };
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const [system, assetRows, existingRates] = await Promise.all([
      getDaaSystemConfigV2(),
      listDaaAssetUniverseV1(),
      listDaaFxRatesV1(),
    ]);

    const strategyBase = normalizeCcyV1((system.config.strategy?.account as any)?.baseCurrency, "USD");
    const fxFeed = system.config.dataSources.fxFeed;
    const rawRetentionDays = Math.max(7, Math.min(365, Math.trunc(system.config.dataSources.priceFeed.marketCache.rawRetentionDays || 90)));
    const fxPairs = mergeFxPairsV1(
      toFxPairsFromConfigV1({
        enabled: fxFeed.enabled !== false,
        baseCurrency: fxFeed.baseCurrency || strategyBase,
        pairs: fxFeed.pairs,
      }),
      toFxPairsFromAssetsV1(strategyBase, assetRows),
    );

    if (fxPairs.length === 0) {
      const finishedAt = new Date().toISOString();
      await appendDaaIngestJobLogV1({
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
      return okV1({
        updatedPairs: [],
        skippedPairs: [],
        failures: [],
        at: finishedAt,
      });
    }

    const nowIso = new Date().toISOString();
    const today = toShanghaiDayV1(new Date(nowIso));
    const existingByPair = new Map(existingRates.map((row) => [
      `${normalizeCcyV1(row.baseCcy)}/${normalizeCcyV1(row.quoteCcy)}`,
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
      if (toBusinessDayV1(existingByPair.get(pair.pair)?.asOfTs) === today) {
        skippedPairs.push(pair.pair);
        continue;
      }

      const fetchResult = await fetchYfinanceFxRateV1(pair.baseCcy, pair.quoteCcy);
      let rawRefId: string | null = null;
      if (fetchResult.payloadJson || fetchResult.payloadText) try {
        const raw = await appendDaaExternalPayloadRawV1({
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
      await upsertDaaFxRatesV1(rowsToUpsert);
    }
    if (fxHistoryRows.length > 0) {
      await appendDaaFxRateHistoryRowsV1(fxHistoryRows);
    }

    await appendDaaIngestJobLogV1({
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

    return okV1({
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
