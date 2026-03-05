import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { getDaaSystemConfigV2, listDaaAssetUniverseV1, listDaaFxRatesV1, upsertDaaFxRatesV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

type NormalizedFxPairV1 = {
  baseCcy: string;
  quoteCcy: string;
  pair: string;
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

async function fetchYfinanceFxRateV1(baseCcy: string, quoteCcy: string): Promise<number> {
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

  let payload: any = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`FX upstream payload invalid for ${baseCcy}/${quoteCcy}`);
  }

  const chartError = payload?.chart?.error;
  if (chartError) {
    throw new Error(`FX chart error for ${baseCcy}/${quoteCcy}`);
  }

  const result = payload?.chart?.result?.[0];
  const metaPrice = Number(result?.meta?.regularMarketPrice);
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
  const closePrice = pickLatestPositiveV1(closes);
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

    const [system, assetRows, existingRates] = await Promise.all([
      getDaaSystemConfigV2(),
      listDaaAssetUniverseV1(),
      listDaaFxRatesV1(),
    ]);

    const strategyBase = normalizeCcyV1((system.config.strategy?.account as any)?.baseCurrency, "USD");
    const fxFeed = system.config.dataSources.fxFeed;
    const fxPairs = mergeFxPairsV1(
      toFxPairsFromConfigV1({
        enabled: fxFeed.enabled !== false,
        baseCurrency: fxFeed.baseCurrency || strategyBase,
        pairs: fxFeed.pairs,
      }),
      toFxPairsFromAssetsV1(strategyBase, assetRows),
    );

    if (fxPairs.length === 0) {
      return okV1({
        updatedPairs: [],
        skippedPairs: [],
        failures: [],
        at: new Date().toISOString(),
      });
    }

    const nowIso = new Date().toISOString();
    const today = toShanghaiDayV1(new Date(nowIso));
    const existingByPair = new Map(existingRates.map((row) => [
      `${normalizeCcyV1(row.baseCcy)}/${normalizeCcyV1(row.quoteCcy)}`,
      row,
    ]));

    const rowsToUpsert: Array<{ baseCcy: string; quoteCcy: string; rate: number; source: string; asOfTs: string }> = [];
    const updatedPairs: string[] = [];
    const skippedPairs: string[] = [];
    const failures: string[] = [];

    for (const pair of fxPairs) {
      if (toBusinessDayV1(existingByPair.get(pair.pair)?.asOfTs) === today) {
        skippedPairs.push(pair.pair);
        continue;
      }
      try {
        const rate = await fetchYfinanceFxRateV1(pair.baseCcy, pair.quoteCcy);
        rowsToUpsert.push({
          baseCcy: pair.baseCcy,
          quoteCcy: pair.quoteCcy,
          rate,
          source: "cron_daily_pull",
          asOfTs: nowIso,
        });
        updatedPairs.push(pair.pair);
      } catch (error) {
        failures.push(`${pair.pair}:${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (rowsToUpsert.length > 0) {
      await upsertDaaFxRatesV1(rowsToUpsert);
    }

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
