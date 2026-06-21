import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  appendDaaExternalPayloadRaw,
  getLatestDaaFundamentalSnapshot,
  upsertDaaFundamentalSnapshots,
} from "@/src/daa/store/daaStorePg";
import { resolveExternalPayloadRawRetentionDays } from "@/src/daa/modules/externalPayload/externalPayloadPolicy";
import {
  fetchYfinanceFundamentals,
  type YfinanceFundamentalSnapshot,
} from "@/src/market/yfinanceFundamentals";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";

export const YFINANCE_FUNDAMENTALS_CACHE_RESOURCE = "fundamentals_yahoo_valuation_v4";
const FUNDAMENTALS_CACHE_TTL_MS_ = 24 * 60 * 60 * 1000;

export type YfinanceFundamentalsCacheStatus =
  | "hit"
  | "miss"
  | "partial_miss"
  | "refresh_failed_stale"
  | "quote_batch";

function isSnapshot(value: unknown): value is YfinanceFundamentalSnapshot {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as { normalizedSymbol?: unknown }).normalizedSymbol === "string";
}

function hasPartialUpstreamFailure(snapshot: YfinanceFundamentalSnapshot): boolean {
  return snapshot.issues.some((issue) => (
    issue === "failed fundamentals timeseries request"
    || issue === "failed quoteSummary request"
  ));
}

async function readCachedSnapshot(input: {
  symbol: string;
  freshOnly: boolean;
  now?: Date;
}): Promise<YfinanceFundamentalSnapshot | null> {
  const normalizedSymbol = normalizeYfinanceSymbol(input.symbol);
  if (!normalizedSymbol) return null;
  const cached = await getLatestDaaFundamentalSnapshot({
    provider: "yfinance",
    normalizedSymbol,
    freshOnly: input.freshOnly,
    nowIso: input.now?.toISOString(),
  }).catch((error) => {
    logSwallowed(`yfinanceFundamentalsCache.cacheRead(${input.symbol})`, error);
    return null;
  });
  return isSnapshot(cached?.snapshotJson) ? cached.snapshotJson : null;
}

export async function fetchYfinanceFundamentalsCached(symbol: string, opts: {
  forceRefresh?: boolean;
  now?: Date;
  timeoutMs?: number;
} = {}): Promise<{
  snapshot: YfinanceFundamentalSnapshot;
  cacheStatus: YfinanceFundamentalsCacheStatus;
}> {
  const now = opts.now ?? new Date();
  const forceRefresh = opts.forceRefresh === true;

  if (!forceRefresh) {
    const cached = await readCachedSnapshot({ symbol, freshOnly: true, now });
    if (cached) return { snapshot: cached, cacheStatus: "hit" };
  }

  try {
    const snapshot = await fetchYfinanceFundamentals(symbol, { timeoutMs: opts.timeoutMs ?? 8_000, now });
    if (hasPartialUpstreamFailure(snapshot)) {
      const stale = await readCachedSnapshot({ symbol, freshOnly: false });
      if (stale) return { snapshot: stale, cacheStatus: "refresh_failed_stale" };
      return { snapshot, cacheStatus: "partial_miss" };
    }

    const structuredExpireAt = new Date(now.getTime() + FUNDAMENTALS_CACHE_TTL_MS_).toISOString();
    let rawRefId: string | null = null;
    const rawRetentionDays = resolveExternalPayloadRawRetentionDays({
      provider: "yfinance",
      resource: YFINANCE_FUNDAMENTALS_CACHE_RESOURCE,
      requestedDays: 90,
    });
    const raw = await appendDaaExternalPayloadRaw({
      provider: "yfinance",
      resource: YFINANCE_FUNDAMENTALS_CACHE_RESOURCE,
      subjectKey: symbol,
      requestJson: { symbol },
      responseStatus: 200,
      payloadJson: snapshot as unknown as Record<string, unknown>,
      fetchedAt: now.toISOString(),
      expireAt: new Date(now.getTime() + rawRetentionDays * 24 * 3600 * 1000).toISOString(),
    }).catch((error) => {
      logSwallowed(`yfinanceFundamentalsCache.cacheWrite(${symbol})`, error);
      return null;
    });
    rawRefId = raw?.id ?? null;

    await upsertDaaFundamentalSnapshots([{
      provider: "yfinance",
      normalizedSymbol: snapshot.normalizedSymbol,
      symbol: snapshot.symbol,
      snapshotJson: snapshot as unknown as Record<string, unknown>,
      fetchedAt: now.toISOString(),
      expireAt: structuredExpireAt,
      rawRefId,
    }]).catch((error) => {
      logSwallowed(`yfinanceFundamentalsCache.snapshotWrite(${symbol})`, error);
    });
    return { snapshot, cacheStatus: "miss" };
  } catch (error) {
    const stale = await readCachedSnapshot({ symbol, freshOnly: false });
    if (stale) return { snapshot: stale, cacheStatus: "refresh_failed_stale" };
    throw error;
  }
}
