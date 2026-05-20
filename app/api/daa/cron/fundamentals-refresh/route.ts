import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  buildAccountScopedRequestIdempotencyKey,
  buildUtcCronWindowIdempotencyKey,
  runForEachActiveDaaAccountScope,
  runIdempotentAccountScopedCronJob,
  summarizeAccountScopedCronRuns,
  unwrapSingleAccountCronResult,
} from "@/src/daa/cron/accountCronScope";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { fetchYfinanceFundamentalsCached } from "@/src/market/yfinanceFundamentalsCache";
import { getYfinanceFundamentalPeerCandidates } from "@/src/market/yfinanceFundamentalsPeers";

export const runtime = "nodejs";

const FUNDAMENTALS_REFRESH_CONCURRENCY = 4;
const FUNDAMENTALS_REFRESH_TIMEOUT_MS = 8_000;
const FUNDAMENTALS_REFRESH_MAX_SYMBOLS = 120;

type RefreshItem = {
  symbol: string;
  role: "portfolio" | "peer";
};

function uniqSymbols(items: RefreshItem[]): RefreshItem[] {
  const out = new Map<string, RefreshItem>();
  for (const item of items) {
    const symbol = normalizeYfinanceSymbol(item.symbol);
    if (!symbol) continue;
    const current = out.get(symbol);
    if (!current || current.role === "peer" && item.role === "portfolio") {
      out.set(symbol, { symbol, role: item.role });
    }
    if (out.size >= FUNDAMENTALS_REFRESH_MAX_SYMBOLS) break;
  }
  return [...out.values()];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
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
      out[index] = await mapper(item);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return out;
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const fallbackKey = buildUtcCronWindowIdempotencyKey("cron_fundamentals_refresh", 24 * 60);
    const runs = await runForEachActiveDaaAccountScope((scope) =>
      runFundamentalsRefreshJob(req, buildAccountScopedRequestIdempotencyKey(scope, req, fallbackKey)),
    );
    const single = unwrapSingleAccountCronResult(runs);
    return ok(single ?? summarizeAccountScopedCronRuns(runs));
  });
}

async function runFundamentalsRefreshJob(req: Request, idempotencyKey: string | null): Promise<Record<string, unknown>> {
  return runIdempotentAccountScopedCronJob({
    req,
    jobType: "cron_fundamentals_refresh",
    triggerSource: "cron_fundamentals_refresh",
    idempotencyKey,
    duplicateReason: "当前账号同一 fundamentals-refresh 幂等任务已完成，跳过重复触发。",
    summarize: (result) => ({
      requested: result.requested,
      refreshed: result.refreshed,
      failed: result.failed,
      portfolioSymbols: result.portfolioSymbols,
      peerSymbols: result.peerSymbols,
      missingMarketCap: result.missingMarketCap,
      missingTtmPe: result.missingTtmPe,
      missingPb: result.missingPb,
      missingGrowth: result.missingGrowth,
    }),
    handler: async () => {
      const rows = await listDaaAssetUniverse();
      const portfolioSymbols = uniqSymbols(rows.map((row) => ({
        symbol: row.symbol,
        role: "portfolio" as const,
      })));
      const peerSymbols = getYfinanceFundamentalPeerCandidates(portfolioSymbols.map((item) => item.symbol))
        .map((symbol) => ({ symbol, role: "peer" as const }));
      const targets = uniqSymbols([...portfolioSymbols, ...peerSymbols]);

      const settled = await mapWithConcurrency(targets, FUNDAMENTALS_REFRESH_CONCURRENCY, async (item) => {
        try {
          const result = await fetchYfinanceFundamentalsCached(item.symbol, {
            forceRefresh: item.role === "portfolio",
            timeoutMs: FUNDAMENTALS_REFRESH_TIMEOUT_MS,
          });
          return { item, ok: true as const, result };
        } catch (error) {
          return {
            item,
            ok: false as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const failures = settled.filter((item) => !item.ok);
      const portfolioResults = settled.filter((item) => item.ok && item.item.role === "portfolio");
      const missingMarketCap = portfolioResults
        .filter((item) => item.ok && item.result.snapshot.marketCap == null)
        .map((item) => item.item.symbol);
      const missingTtmPe = portfolioResults
        .filter((item) => item.ok && item.result.snapshot.trailingPE == null)
        .map((item) => item.item.symbol);
      const missingPb = portfolioResults
        .filter((item) => item.ok && item.result.snapshot.pbRatio == null)
        .map((item) => item.item.symbol);
      const missingGrowth = portfolioResults
        .filter((item) => item.ok && item.result.snapshot.earningsGrowthPct == null && item.result.snapshot.revenueGrowthPct == null)
        .map((item) => item.item.symbol);

      return {
        requested: targets.length,
        refreshed: settled.length - failures.length,
        failed: failures.length,
        portfolioSymbols: portfolioSymbols.length,
        peerSymbols: targets.filter((item) => item.role === "peer").length,
        missingMarketCap,
        missingTtmPe,
        missingPb,
        missingGrowth,
        cacheStatusCounts: settled.reduce<Record<string, number>>((acc, item) => {
          if (!item.ok) {
            acc.failed = (acc.failed || 0) + 1;
            return acc;
          }
          acc[item.result.cacheStatus] = (acc[item.result.cacheStatus] || 0) + 1;
          return acc;
        }, {}),
        failures: failures.slice(0, 8).map((item) => ({
          symbol: item.item.symbol,
          role: item.item.role,
          error: item.error,
        })),
        at: new Date().toISOString(),
      };
    },
  });
}
