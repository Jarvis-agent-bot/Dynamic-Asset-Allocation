import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import type { YfinanceFundamentalSnapshot } from "@/src/market/yfinanceFundamentals";
import { fetchYfinanceFundamentalsCached } from "@/src/market/yfinanceFundamentalsCache";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

const MAX_SYMBOLS_ = 30;

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
      symbols.map((symbol) => fetchYfinanceFundamentalsCached(symbol, { forceRefresh, now, timeoutMs: 8_000 })),
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
