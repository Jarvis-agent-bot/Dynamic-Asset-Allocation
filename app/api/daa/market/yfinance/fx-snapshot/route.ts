import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { listDaaFxRates, upsertDaaFxRates } from "@/src/daa/store/daaStorePg";

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
    throw new Error(`FX chart error for ${baseCcy}/${quoteCcy}: ${String(chartError?.description || chartError?.code || "unknown")}`);
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

    for (const pair of pairs) {
      if (alreadyPulledPairs.includes(pair.pair)) continue;
      const rate = await fetchFxRateFromYfinance(pair.baseCcy, pair.quoteCcy);
      rowsToUpsert.push({
        baseCcy: pair.baseCcy,
        quoteCcy: pair.quoteCcy,
        rate,
        source: "manual_daily_pull",
        asOfTs: nowIso,
      });
      updatedPairs.push(pair.pair);
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
