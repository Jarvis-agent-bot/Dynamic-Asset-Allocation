/**
 * 管理接口：为价格历史不足的 symbol 拉取 2 年 Yahoo 历史。
 * 用法（cron token 鉴权）：
 *   curl -X POST -H "x-daa-cron-token: $DAA_CRON_TOKEN" \
 *     "http://daa-web:3000/api/daa/admin/price-history-backfill?minDays=252&lookbackDays=730"
 *
 * 不开放给用户/外网；仅供 docker exec 或内网调用。
 */

import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

const DEFAULT_MIN_DAYS = 252;
const DEFAULT_LOOKBACK_DAYS = 730;
const DEFAULT_CONCURRENCY = 3;
const MAX_SYMBOLS_PER_RUN = 60;

type ShortSymbol = { market: string; symbol: string; days: number };

async function listShortHistorySymbols(minDays: number): Promise<ShortSymbol[]> {
  return withDaaPgClient(async ({ query }) => {
    const res = await query<{ market: string; symbol: string; days: number }>(
      `SELECT market, symbol, COUNT(*)::int AS days
       FROM daa_market_price_history_v1
       GROUP BY market, symbol
       HAVING COUNT(*) < $1
       ORDER BY COUNT(*) ASC
       LIMIT $2`,
      [minDays, MAX_SYMBOLS_PER_RUN],
    );
    return res.rows;
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const url = new URL(req.url);
    const minDays = Math.max(30, Math.min(2000, Number(url.searchParams.get("minDays") ?? DEFAULT_MIN_DAYS)));
    const lookbackDays = Math.max(30, Math.min(3650, Number(url.searchParams.get("lookbackDays") ?? DEFAULT_LOOKBACK_DAYS)));
    const concurrency = Math.max(1, Math.min(8, Number(url.searchParams.get("concurrency") ?? DEFAULT_CONCURRENCY)));

    const execution = await runLoggedJob({
      req,
      jobType: "admin_price_history_backfill",
      triggerSource: "admin_price_history_backfill",
      summarize: (result) => result && typeof result === "object" ? result as Record<string, unknown> : {},
      handler: async () => {
        const shortSymbols = await listShortHistorySymbols(minDays);
        if (shortSymbols.length === 0) {
          return { scanned: 0, backfilled: 0, failed: 0, message: `no symbols below ${minDays} days` };
        }

        const start = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
        const results: Array<{ symbol: string; before: number; after: number; ok: boolean; error?: string }> = [];

        let cursor = 0;
        async function worker() {
          for (;;) {
            const i = cursor;
            cursor += 1;
            const item = shortSymbols[i];
            if (!item) return;
            try {
              const r = await fetchPriceSeriesWithCache(item.symbol, start, {
                market: item.market,
                writeMode: "sync",
                minDbDays: 30,
                maxStaleDays: 0,
              });
              results.push({
                symbol: `${item.market}::${item.symbol}`,
                before: item.days,
                after: r?.data?.length ?? 0,
                ok: Boolean(r?.data?.length),
              });
            } catch (e) {
              logSwallowed(`adminPriceBackfill.${item.symbol}`, e);
              results.push({
                symbol: `${item.market}::${item.symbol}`,
                before: item.days,
                after: 0,
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, shortSymbols.length) }, () => worker()));

        const succeeded = results.filter((r) => r.ok);
        const failed = results.filter((r) => !r.ok);
        return {
          scanned: shortSymbols.length,
          backfilled: succeeded.length,
          failed: failed.length,
          minDays,
          lookbackDays,
          symbols: results.slice(0, 30),
        };
      },
    });

    return ok({
      ...execution.result,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}
