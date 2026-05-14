import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  appendDaaExternalPayloadRaw,
  getLatestDaaExternalPayloadRaw,
} from "@/src/daa/store/daaStorePg";
import {
  fetchYfinanceFundamentals,
  type YfinanceFundamentalSnapshot,
} from "@/src/market/yfinanceFundamentals";

export const YFINANCE_FUNDAMENTALS_CACHE_RESOURCE = "fundamentals_yahoo_valuation_v3";
const FUNDAMENTALS_CACHE_TTL_MS_ = 24 * 60 * 60 * 1000;

function isSnapshot(value: unknown): value is YfinanceFundamentalSnapshot {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as { normalizedSymbol?: unknown }).normalizedSymbol === "string";
}

export async function fetchYfinanceFundamentalsCached(symbol: string, opts: {
  forceRefresh?: boolean;
  now?: Date;
  timeoutMs?: number;
} = {}): Promise<{
  snapshot: YfinanceFundamentalSnapshot;
  cacheStatus: "hit" | "miss" | "refresh_failed_stale";
}> {
  const now = opts.now ?? new Date();
  const forceRefresh = opts.forceRefresh === true;

  if (!forceRefresh) {
    const cached = await getLatestDaaExternalPayloadRaw({
      provider: "yfinance",
      resource: YFINANCE_FUNDAMENTALS_CACHE_RESOURCE,
      subjectKey: symbol,
      freshOnly: true,
      nowIso: now.toISOString(),
    }).catch((error) => {
      logSwallowed(`yfinanceFundamentalsCache.cacheRead(${symbol})`, error);
      return null;
    });
    if (isSnapshot(cached?.payloadJson)) {
      return { snapshot: cached.payloadJson, cacheStatus: "hit" };
    }
  }

  try {
    const snapshot = await fetchYfinanceFundamentals(symbol, { timeoutMs: opts.timeoutMs ?? 8_000, now });
    await appendDaaExternalPayloadRaw({
      provider: "yfinance",
      resource: YFINANCE_FUNDAMENTALS_CACHE_RESOURCE,
      subjectKey: symbol,
      requestJson: { symbol },
      responseStatus: 200,
      payloadJson: snapshot as unknown as Record<string, unknown>,
      fetchedAt: now.toISOString(),
      expireAt: new Date(now.getTime() + FUNDAMENTALS_CACHE_TTL_MS_).toISOString(),
    }).catch((error) => {
      logSwallowed(`yfinanceFundamentalsCache.cacheWrite(${symbol})`, error);
    });
    return { snapshot, cacheStatus: "miss" };
  } catch (error) {
    const stale = await getLatestDaaExternalPayloadRaw({
      provider: "yfinance",
      resource: YFINANCE_FUNDAMENTALS_CACHE_RESOURCE,
      subjectKey: symbol,
      freshOnly: false,
    }).catch(() => null);
    if (isSnapshot(stale?.payloadJson)) {
      return { snapshot: stale.payloadJson, cacheStatus: "refresh_failed_stale" };
    }
    throw error;
  }
}
