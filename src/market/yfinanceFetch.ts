import { addDaysIsoUtc, normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { MARKET_DATA_USER_AGENT } from "@/src/market/constants";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function epochSecondsUtcStart(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00.000Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
}

export async function fetchYfinanceLatestClose(symbolRaw: string): Promise<{ symbol: string; price: number; ts: string } | null> {
  const symbol = normalizeYfinanceSymbol(symbolRaw);
  if (!symbol) return null;

  const end = new Date().toISOString().slice(0, 10);
  const start = addDaysIsoUtc(end, -10);
  const endExclusive = addDaysIsoUtc(end, 1);

  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set("interval", "1d");
  upstream.searchParams.set("events", "div%7Csplit");
  upstream.searchParams.set("period1", String(epochSecondsUtcStart(start)));
  upstream.searchParams.set("period2", String(epochSecondsUtcStart(endExclusive)));

  try {
    const response = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": MARKET_DATA_USER_AGENT,
      },
    });

    if (!response.ok) return null;

    const payload = await response.json() as any;
    const timestamps = Array.isArray(payload?.chart?.result?.[0]?.timestamp) ? payload.chart.result[0].timestamp : [];
    const quote0 = payload?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
    const closes = Array.isArray(quote0?.close) ? quote0.close : [];

    if (!timestamps.length || !closes.length) return null;

    for (let i = closes.length - 1; i >= 0; i -= 1) {
      const close = Number(closes[i]);
      const ts = Number(timestamps[i]);
      if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(ts)) continue;
      return {
        symbol,
        price: close,
        ts: new Date(ts * 1000).toISOString(),
      };
    }

    return null;
  } catch (err) {
  logSwallowed("yfinanceFetch.parseResponse", err);
    return null;
  }
}
