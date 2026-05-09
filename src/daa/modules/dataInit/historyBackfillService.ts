/**
 * 历史数据回填服务 — 批量从 yfinance 拉取 OHLCV 数据并写入 daa_price_history。
 */

import { createMarketDataClient } from "@/src/market/marketDataClient";
import { appendAssetPriceHistoryRows } from "@/src/daa/store/portfolioStore";
import { listDaaAssetUniverse } from "@/src/daa/store/assetUniverseStore";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type BackfillRange = "1y" | "2y" | "5y";
export type BackfillInterval = "1d" | "1h";

type BackfillRequest = {
  assetKeys?: string[];
  range: BackfillRange;
  interval: BackfillInterval;
};

type BackfillResult = {
  total: number;
  completed: number;
  failed: Array<{ assetKey: string; error: string }>;
  rowsInserted: number;
};

const RANGE_DAYS: Record<BackfillRange, number> = {
  "1y": 365,
  "2y": 730,
  "5y": 1825,
};

const MAX_CONCURRENCY = 4;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 简单的并发限制器 — 每次最多 N 个任务同时运行。
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

export async function runHistoryBackfill(req: BackfillRequest): Promise<BackfillResult> {
  // 1. 确定要回填的资产列表
  let assetKeys: string[];
  if (req.assetKeys && req.assetKeys.length > 0) {
    assetKeys = req.assetKeys;
  } else {
    const universe = await listDaaAssetUniverse();
    assetKeys = universe.map((r) => r.assetKey);
  }

  if (assetKeys.length === 0) {
    return { total: 0, completed: 0, failed: [], rowsInserted: 0 };
  }

  // 2. 计算日期范围
  const days = RANGE_DAYS[req.range] ?? 365;
  const now = new Date();
  const startDate = toIsoDate(new Date(now.getTime() - days * 86_400_000));
  const endDate = toIsoDate(now);

  // 3. 创建 market data client（走内部 API 路由）
  const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`;
  const client = createMarketDataClient({ endpointBase: baseUrl });

  const result: BackfillResult = {
    total: assetKeys.length,
    completed: 0,
    failed: [],
    rowsInserted: 0,
  };

  // 4. 并发回填
  await runWithConcurrency(assetKeys, MAX_CONCURRENCY, async (assetKey) => {
    const parsed = parseDaaAssetKey(assetKey);
    if (!parsed) {
      result.failed.push({ assetKey, error: "无法解析 assetKey" });
      return;
    }

    try {
      const bars = await client.yfinance.priceSeriesBars({
        symbol: parsed.symbol,
        start: startDate,
        end: endDate,
      });

      if (bars.length === 0) {
        result.failed.push({ assetKey, error: "yfinance 返回 0 条数据" });
        return;
      }

      const rows = bars.map((bar) => ({
        assetKey,
        ts: `${bar.date}T00:00:00.000Z`,
        price: bar.close,
        source: "backfill",
        open: bar.open,
        high: bar.high,
        low: bar.low,
        volume: bar.volume,
      }));

      const inserted = await appendAssetPriceHistoryRows(rows);
      result.rowsInserted += inserted;
      result.completed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logSwallowed(`historyBackfill.${assetKey}`, err);
      result.failed.push({ assetKey, error: message });
    }
  });

  return result;
}
