import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  fetchYfinanceQuoteBatchSnapshots,
  type YfinanceFundamentalSnapshot,
} from "@/src/market/yfinanceFundamentals";
import {
  fetchYfinanceFundamentalsCached,
  type YfinanceFundamentalsCacheStatus,
} from "@/src/market/yfinanceFundamentalsCache";
import {
  enrichYfinanceFundamentalSnapshotsWithPeers,
  getYfinanceFundamentalPeerCandidates,
} from "@/src/market/yfinanceFundamentalsPeers";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

const MAX_SYMBOLS_ = 30;
const FUNDAMENTALS_ROUTE_CONCURRENCY_ = 4;

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

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item == null) return;
      out[index] = await mapper(item, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return out;
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

    const peerSymbols = getYfinanceFundamentalPeerCandidates(symbols);
    const [settled, peerBatch] = await Promise.all([
      mapWithConcurrency(
        symbols,
        FUNDAMENTALS_ROUTE_CONCURRENCY_,
        async (symbol) => {
          try {
            const value = await fetchYfinanceFundamentalsCached(symbol, { forceRefresh, now, timeoutMs: 8_000 });
            return { status: "fulfilled" as const, value };
          } catch (reason) {
            return { status: "rejected" as const, reason };
          }
        },
      ),
      peerSymbols.length > 0
        ? fetchYfinanceQuoteBatchSnapshots(peerSymbols, { now, timeoutMs: 8_000 })
          .then((value) => ({ status: "fulfilled" as const, value }))
          .catch((reason) => ({ status: "rejected" as const, reason }))
        : Promise.resolve({ status: "fulfilled" as const, value: {} as Record<string, YfinanceFundamentalSnapshot> }),
    ]);
    const items: Record<string, YfinanceFundamentalSnapshot> = {};
    const cache: Record<string, YfinanceFundamentalsCacheStatus> = {};
    const errors: Record<string, string> = {};
    const peerItems: Record<string, YfinanceFundamentalSnapshot> = peerBatch.status === "fulfilled" ? peerBatch.value : {};
    const peerCache: Record<string, YfinanceFundamentalsCacheStatus> = {};
    const peerErrors: Record<string, string> = {};

    for (let i = 0; i < settled.length; i += 1) {
      const symbol = symbols[i];
      const result = settled[i];
      if (!symbol || !result) continue;
      if (result.status === "fulfilled") {
        items[symbol] = result.value.snapshot;
        cache[symbol] = result.value.cacheStatus;
      } else {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors[symbol] = message;
        logSwallowed(`yfinanceFundamentalsRoute.fetch(${symbol})`, result.reason);
      }
    }

    if (peerBatch.status === "rejected") {
      const message = peerBatch.reason instanceof Error ? peerBatch.reason.message : String(peerBatch.reason);
      logSwallowed("yfinanceFundamentalsRoute.peerQuoteBatch", peerBatch.reason);
      for (const symbol of peerSymbols) peerErrors[symbol] = message;
    } else {
      for (const symbol of peerSymbols) {
        if (peerItems[symbol]) {
          peerCache[symbol] = "quote_batch";
        } else {
          peerErrors[symbol] = "missing from Yahoo quote batch response";
        }
      }
    }

    return ok({
      source: "yfinance",
      symbols,
      items: enrichYfinanceFundamentalSnapshotsWithPeers(items, peerItems),
      cache,
      errors,
      peerSymbols,
      peerCache,
      peerErrors,
    });
  });
}
