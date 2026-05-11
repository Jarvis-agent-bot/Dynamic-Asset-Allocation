import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { listDaaFxRates, upsertDaaFxRates } from "@/src/daa/store/daaStorePg";
import { MARKET_DATA_USER_AGENT } from "@/src/market/constants";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type FxSnapshotBody = {
  pairs?: unknown;
  baseCurrency?: unknown;
};

type NormalizedPair = {
  baseCcy: string;
  quoteCcy: string;
  pair: string;
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

function normalizePairToken(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "/");
}

function buildPair(baseCcy: string, quoteCcy: string): NormalizedPair {
  const normalizedBase = normalizeCcy(baseCcy);
  const normalizedQuote = normalizeCcy(quoteCcy);
  return {
    baseCcy: normalizedBase,
    quoteCcy: normalizedQuote,
    pair: `${normalizedBase}/${normalizedQuote}`,
  };
}

function normalizePairsInput(pairs: unknown, fallbackBaseCurrency: string): NormalizedPair[] {
  const tokens = Array.isArray(pairs)
    ? pairs
    : typeof pairs === "string"
      ? pairs.split(/[\s,，;；\n]+/g)
      : [];

  const out = new Map<string, NormalizedPair>();
  for (const raw of tokens) {
    const token = normalizePairToken(String(raw || ""));
    if (!token) continue;

    if (/^[A-Z]{3}\/[A-Z]{3}$/.test(token)) {
      const [baseCcy, quoteCcy] = token.split("/");
      const pair = buildPair(baseCcy, quoteCcy);
      out.set(pair.pair, pair);
      continue;
    }

    if (/^[A-Z]{3}$/.test(token)) {
      const pair = buildPair(fallbackBaseCurrency, token);
      out.set(pair.pair, pair);
    }
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

async function fetchFxRateFromYfinance(baseCcy: string, quoteCcy: string): Promise<number> {
  if (baseCcy === quoteCcy) return 1;

  const symbol = `${baseCcy}${quoteCcy}=X`;
  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set("interval", "1d");
  upstream.searchParams.set("range", "5d");

  const response = await fetch(upstream, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": MARKET_DATA_USER_AGENT,
    },
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`FX upstream error(${response.status}) for ${baseCcy}/${quoteCcy}`);
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch (err) {
    logSwallowed("fxSnapshotRoute.parsePayload", err);
    throw new Error(`FX upstream payload invalid for ${baseCcy}/${quoteCcy}`);
  }

  const payloadRoot = isRecord(payload) ? payload : {};
  const chart = isRecord(payloadRoot.chart) ? payloadRoot.chart : {};
  const chartError = isRecord(chart.error) ? chart.error : null;
  if (chartError) {
    throw new Error(`FX chart error for ${baseCcy}/${quoteCcy}: ${String(chartError.description || chartError.code || "unknown")}`);
  }

  const resultRows = Array.isArray(chart.result) ? chart.result : [];
  const result = isRecord(resultRows[0]) ? resultRows[0] : {};
  const meta = isRecord(result.meta) ? result.meta : {};
  const indicators = isRecord(result.indicators) ? result.indicators : {};
  const quoteRows = Array.isArray(indicators.quote) ? indicators.quote : [];
  const quote0 = isRecord(quoteRows[0]) ? quoteRows[0] : {};
  const metaPrice = Number(meta.regularMarketPrice);
  const closes = Array.isArray(quote0.close) ? quote0.close : [];
  const closePrice = pickLatestPositive(closes);
  const rate = metaPrice > 0 ? metaPrice : closePrice;

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`FX rate missing for ${baseCcy}/${quoteCcy}`);
  }

  return rate;
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<FxSnapshotBody>(req);
    const baseCurrency = normalizeCcy(body?.baseCurrency, "USD");
    const pairs = normalizePairsInput(body?.pairs, baseCurrency);

    if (!pairs.length) {
      return fail("VALIDATION_FAILED", "pairs must include at least one valid pair", { status: 400 });
    }
    if (pairs.length > 20) {
      return fail("VALIDATION_FAILED", "pairs length exceeds limit(20)", { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const today = toShanghaiDay(new Date(nowIso));

    const existingRates = await listDaaFxRates();
    const existingByPair = new Map(existingRates.map((row) => [
      `${normalizeCcy(row.baseCcy)}/${normalizeCcy(row.quoteCcy)}`,
      row,
    ]));

    const alreadyPulledPairs = pairs
      .filter((pair) => toBusinessDay(existingByPair.get(pair.pair)?.asOfTs) === today)
      .map((pair) => pair.pair);

    if (alreadyPulledPairs.length === pairs.length) {
      return ok({
        pulledAt: nowIso,
        day: today,
        alreadyPulledToday: true,
        skippedPairs: alreadyPulledPairs,
        rates: existingRates,
      });
    }

    const rowsToUpsert: Array<{ baseCcy: string; quoteCcy: string; rate: number; source: string; asOfTs: string }> = [];
    const updatedPairs: string[] = [];

    // 并行拉取汇率（批次大小 5，避免上游限流）
    const pending = pairs.filter((p) => !alreadyPulledPairs.includes(p.pair));
    const BATCH_SIZE = 5;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (pair) => {
          const rate = await fetchFxRateFromYfinance(pair.baseCcy, pair.quoteCcy);
          return { baseCcy: pair.baseCcy, quoteCcy: pair.quoteCcy, rate, pair: pair.pair };
        }),
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          rowsToUpsert.push({
            baseCcy: result.value.baseCcy,
            quoteCcy: result.value.quoteCcy,
            rate: result.value.rate,
            source: "manual_daily_pull",
            asOfTs: nowIso,
          });
          updatedPairs.push(result.value.pair);
        }
      }
    }

    const rates = rowsToUpsert.length ? await upsertDaaFxRates(rowsToUpsert) : existingRates;

    return ok({
      pulledAt: nowIso,
      day: today,
      alreadyPulledToday: false,
      updatedPairs,
      skippedPairs: alreadyPulledPairs,
      rates,
    });
  });
}
