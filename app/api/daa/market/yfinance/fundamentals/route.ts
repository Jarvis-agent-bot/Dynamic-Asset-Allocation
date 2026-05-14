import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { fetchYfinanceFundamentals, type YfinanceFundamentalSnapshot } from "@/src/market/yfinanceFundamentals";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  appendDaaExternalPayloadRaw,
  getLatestDaaExternalPayloadRaw,
} from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

const MAX_SYMBOLS_ = 30;
const FUNDAMENTALS_CACHE_TTL_MS_ = 24 * 60 * 60 * 1000;
const FUNDAMENTALS_CACHE_RESOURCE_ = "fundamentals_yahoo_valuation_v2";

function parseSymbols(url: URL): string[] {
  const raw = url.searchParams.get("symbols") || url.searchParams.get("symbol") || "";
  const dedup = new Map<string, string>();
  for (const item of raw.split(",")) {
    const symbol = normalizeYfinanceSymbol(item);
    if (!symbol || dedup.has(symbol)) continue;
    dedup.set(symbol, symbol);
    if (dedup.size >= MAX_SYMBOLS_) break;
  }
  return [...dedup.values()];
}

function isSnapshot(value: unknown): value is YfinanceFundamentalSnapshot {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as { normalizedSymbol?: unknown }).normalizedSymbol === "string";
}

async function fetchFundamentalsCached(symbol: string, opts: {
  forceRefresh: boolean;
  now: Date;
}): Promise<{ snapshot: YfinanceFundamentalSnapshot; cacheStatus: "hit" | "miss" | "refresh_failed_stale" }> {
  if (!opts.forceRefresh) {
    const cached = await getLatestDaaExternalPayloadRaw({
      provider: "yfinance",
      resource: FUNDAMENTALS_CACHE_RESOURCE_,
      subjectKey: symbol,
      freshOnly: true,
      nowIso: opts.now.toISOString(),
    }).catch((error) => {
      logSwallowed(`yfinanceFundamentalsRoute.cacheRead(${symbol})`, error);
      return null;
    });
    if (isSnapshot(cached?.payloadJson)) {
      return { snapshot: cached.payloadJson, cacheStatus: "hit" };
    }
  }

  try {
    const snapshot = await fetchYfinanceFundamentals(symbol, { timeoutMs: 8_000, now: opts.now });
    await appendDaaExternalPayloadRaw({
      provider: "yfinance",
      resource: FUNDAMENTALS_CACHE_RESOURCE_,
      subjectKey: symbol,
      requestJson: { symbol },
      responseStatus: 200,
      payloadJson: snapshot as unknown as Record<string, unknown>,
      fetchedAt: opts.now.toISOString(),
      expireAt: new Date(opts.now.getTime() + FUNDAMENTALS_CACHE_TTL_MS_).toISOString(),
    }).catch((error) => {
      logSwallowed(`yfinanceFundamentalsRoute.cacheWrite(${symbol})`, error);
    });
    return { snapshot, cacheStatus: "miss" };
  } catch (error) {
    const stale = await getLatestDaaExternalPayloadRaw({
      provider: "yfinance",
      resource: FUNDAMENTALS_CACHE_RESOURCE_,
      subjectKey: symbol,
      freshOnly: false,
    }).catch(() => null);
    if (isSnapshot(stale?.payloadJson)) {
      return { snapshot: stale.payloadJson, cacheStatus: "refresh_failed_stale" };
    }
    throw error;
  }
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const symbols = parseSymbols(url);
    const forceRefresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
    const now = new Date();
    if (symbols.length === 0) {
      return fail("VALIDATION_FAILED", "missing symbols", { status: 400 });
    }

    const settled = await Promise.allSettled(
      symbols.map((symbol) => fetchFundamentalsCached(symbol, { forceRefresh, now })),
    );
    const items: Record<string, YfinanceFundamentalSnapshot> = {};
    const cache: Record<string, "hit" | "miss" | "refresh_failed_stale"> = {};
    const errors: Record<string, string> = {};

    for (let i = 0; i < settled.length; i += 1) {
      const symbol = symbols[i];
      const result = settled[i];
      if (result.status === "fulfilled") {
        items[symbol] = result.value.snapshot;
        cache[symbol] = result.value.cacheStatus;
      } else {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors[symbol] = message;
        logSwallowed(`yfinanceFundamentalsRoute.fetch(${symbol})`, result.reason);
      }
    }

    return ok({
      source: "yfinance",
      symbols,
      items,
      cache,
      errors,
    });
  });
}
