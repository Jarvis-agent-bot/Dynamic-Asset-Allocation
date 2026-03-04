import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import {
  appendPriceHistoryRowsV1,
  getDaaSystemConfigV2,
  listDaaAssetUniverseV1,
  listDaaFxRatesV1,
  updateDaaAssetUniverseLastPriceV1,
  upsertDaaFxRatesV1,
} from "@/src/daa/store/daaStorePgV1";
import { fetchYfinanceLatestCloseV1 } from "@/src/market/yfinanceFetchV1";
import { toYfinanceSymbolByMarketV1 } from "@/src/market/yfinanceSymbolV1";

export const runtime = "nodejs";

function toSymbolsFromDataSources(dataSources: Array<{ configJson: Record<string, unknown> }>): string[] {
  const out = new Set<string>();
  for (const source of dataSources) {
    const symbolsRaw = (source.configJson as any)?.symbols;
    if (Array.isArray(symbolsRaw)) {
      for (const symbol of symbolsRaw) {
        const key = String(symbol || "").trim().toUpperCase();
        if (key) out.add(key);
      }
      continue;
    }

    if (typeof symbolsRaw === "string") {
      for (const part of symbolsRaw.split(",")) {
        const key = String(part || "").trim().toUpperCase();
        if (key) out.add(key);
      }
    }
  }
  return [...out];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type NormalizedFxPair = {
  baseCcy: string;
  quoteCcy: string;
  pair: string;
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

function buildFxPair(baseCcy: string, quoteCcy: string): NormalizedFxPair {
  const base = normalizeCcy(baseCcy, "USD");
  const quote = normalizeCcy(quoteCcy, "USD");
  return {
    baseCcy: base,
    quoteCcy: quote,
    pair: `${base}/${quote}`,
  };
}

function toFxPairsFromDataSources(dataSources: Array<{ enabled: boolean; configJson: Record<string, unknown> }>): NormalizedFxPair[] {
  const out = new Map<string, NormalizedFxPair>();
  for (const source of dataSources) {
    if (source.enabled === false) continue;
    const config = source.configJson || {};
    const baseCurrency = normalizeCcy((config as any).baseCurrency, "USD");
    const pairsRaw = (config as any).pairs;
    const tokens = Array.isArray(pairsRaw)
      ? pairsRaw
      : typeof pairsRaw === "string"
        ? pairsRaw.split(/[\s,，;；\n]+/g)
        : [];

    for (const raw of tokens) {
      const token = normalizePairToken(raw);
      if (!token) continue;
      if (/^[A-Z]{3}\/[A-Z]{3}$/.test(token)) {
        const [base, quote] = token.split("/");
        const pair = buildFxPair(base, quote);
        out.set(pair.pair, pair);
        continue;
      }
      if (/^[A-Z]{3}$/.test(token)) {
        const pair = buildFxPair(baseCurrency, token);
        out.set(pair.pair, pair);
      }
    }
  }
  return [...out.values()];
}

function toFxPairsFromAssets(
  baseCurrency: string,
  assetRows: Array<{ currency: string; holdingQty: number; watchEnabled: boolean }>,
): NormalizedFxPair[] {
  const out = new Map<string, NormalizedFxPair>();
  const base = normalizeCcy(baseCurrency, "USD");
  const append = (currency: unknown) => {
    const local = normalizeCcy(currency, base);
    if (!local || local === base) return;
    const pair = buildFxPair(base, local);
    out.set(pair.pair, pair);
  };

  for (const row of assetRows) {
    if (!(row.holdingQty > 0) && row.watchEnabled === false) continue;
    append(row.currency);
  }
  return [...out.values()];
}

type PriceTarget = {
  yfinanceSymbol: string;
};

function toPriceTargetsV1(input: {
  dataSources: Array<{ configJson: Record<string, unknown> }>;
  assetRows: Array<{ symbol: string; market: string }>;
}): PriceTarget[] {
  const out = new Map<string, PriceTarget>();

  for (const row of input.assetRows) {
    const yfinanceSymbol = toYfinanceSymbolByMarketV1(row.symbol, row.market);
    if (!yfinanceSymbol) continue;
    out.set(yfinanceSymbol, {
      yfinanceSymbol,
    });
  }

  const sourceSymbols = toSymbolsFromDataSources(input.dataSources);
  for (const symbol of sourceSymbols) {
    const yfinanceSymbol = toYfinanceSymbolByMarketV1(symbol, "US");
    if (!yfinanceSymbol || out.has(yfinanceSymbol)) continue;
    out.set(yfinanceSymbol, {
      yfinanceSymbol,
    });
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

async function fetchYfinanceFxRate(baseCcy: string, quoteCcy: string): Promise<number> {
  if (baseCcy === quoteCcy) return 1;

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
  if (!response.ok) {
    throw new Error(`FX upstream error(${response.status}) for ${baseCcy}/${quoteCcy}`);
  }

  const payload = JSON.parse(raw) as any;
  const chartError = payload?.chart?.error;
  if (chartError) {
    throw new Error(`FX chart error for ${baseCcy}/${quoteCcy}`);
  }

  const result = payload?.chart?.result?.[0];
  const metaPrice = Number(result?.meta?.regularMarketPrice);
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
  const closePrice = pickLatestPositive(closes);
  const rate = metaPrice > 0 ? metaPrice : closePrice;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`FX rate missing for ${baseCcy}/${quoteCcy}`);
  }
  return rate;
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const [system, assetRows] = await Promise.all([getDaaSystemConfigV2(), listDaaAssetUniverseV1()]);
    const priceFeed = system.config.dataSources.priceFeed;
    const fxFeed = system.config.dataSources.fxFeed;
    const dataSources = priceFeed.enabled
      ? [{ configJson: { symbols: priceFeed.symbols } }]
      : [];
    const fxDataSources = fxFeed.enabled
      ? [{ enabled: true, configJson: { baseCurrency: fxFeed.baseCurrency, pairs: fxFeed.pairs } }]
      : [];
    const strategyObj = toRecord(system.config.strategy as unknown as Record<string, unknown>);
    const accountObj = toRecord(strategyObj.account);
    const strategyBaseCurrency = normalizeCcy(accountObj.baseCurrency, "USD");
    const priceTargets = toPriceTargetsV1({ dataSources, assetRows });

    const latestBySymbol = new Map<string, { symbol: string; price: number; ts: string }>();
    for (const target of priceTargets) {
      const latest = await fetchYfinanceLatestCloseV1(target.yfinanceSymbol);
      if (!latest || !(latest.price > 0)) continue;
      latestBySymbol.set(target.yfinanceSymbol, latest);
    }
    const hits = [...latestBySymbol.values()];

    await appendPriceHistoryRowsV1(hits.map((row) => ({ ...row, source: "yfinance" })));

    const refreshedAssetKeys: string[] = [];
    for (const row of assetRows) {
      const yfinanceSymbol = toYfinanceSymbolByMarketV1(row.symbol, row.market);
      if (!yfinanceSymbol) continue;
      const latest = latestBySymbol.get(yfinanceSymbol);
      if (!latest || !(latest.price > 0)) continue;
      const updated = await updateDaaAssetUniverseLastPriceV1({
        assetKey: row.assetKey,
        lastPrice: latest.price,
        priceUpdatedAt: latest.ts,
      });
      if (updated) refreshedAssetKeys.push(updated.assetKey);
    }

    const fxPairs = mergeFxPairs(
      toFxPairsFromDataSources(fxDataSources),
      toFxPairsFromAssets(strategyBaseCurrency, assetRows),
    );
    const fxFailures: string[] = [];
    const refreshedFxPairs: string[] = [];
    if (fxPairs.length > 0) {
      const nowIso = new Date().toISOString();
      const today = toShanghaiDay(new Date(nowIso));
      const existingRates = await listDaaFxRatesV1();
      const existingByPair = new Map(existingRates.map((row) => [
        `${normalizeCcy(row.baseCcy)}/${normalizeCcy(row.quoteCcy)}`,
        row,
      ]));
      const rowsToUpsert: Array<{ baseCcy: string; quoteCcy: string; rate: number; source: string; asOfTs: string }> = [];

      for (const pair of fxPairs) {
        if (toBusinessDay(existingByPair.get(pair.pair)?.asOfTs) === today) continue;
        try {
          const rate = await fetchYfinanceFxRate(pair.baseCcy, pair.quoteCcy);
          rowsToUpsert.push({
            baseCcy: pair.baseCcy,
            quoteCcy: pair.quoteCcy,
            rate,
            source: "cron_daily_pull",
            asOfTs: nowIso,
          });
          refreshedFxPairs.push(pair.pair);
        } catch (error) {
          fxFailures.push(`${pair.pair}:${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (rowsToUpsert.length > 0) {
        await upsertDaaFxRatesV1(rowsToUpsert);
      }
    }

    return okV1({
      refreshedSymbols: hits.length,
      symbols: hits.map((x) => x.symbol),
      refreshedAssets: refreshedAssetKeys.length,
      assetKeys: refreshedAssetKeys,
      refreshedFxPairs,
      fxFailures,
      at: new Date().toISOString(),
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
