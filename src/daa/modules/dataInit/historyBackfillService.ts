/**
 * 历史数据回填服务 — 批量从 Yahoo 拉取真实 OHLCV candle 并写入统一行情缓存。
 */

import { listDaaAssetUniverse } from "@/src/daa/store/assetUniverseStore";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";

export type BackfillRange = "1y" | "2y" | "5y";
export type BackfillInterval = "1d";

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
  rowsWritten: number;
  rowsCovered: number;
  rowsReused: number;
};

const RANGE_DAYS: Record<BackfillRange, number> = {
  "1y": 365,
  "2y": 730,
  "5y": 1825,
};

const MAX_CONCURRENCY = 4;
const START_COVERAGE_TOLERANCE_DAYS = 7;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function coversStartDate(firstDate: string | undefined, requestedStart: string): boolean {
  if (!firstDate) return false;
  const first = Date.parse(firstDate.slice(0, 10));
  const requested = Date.parse(requestedStart.slice(0, 10));
  if (!Number.isFinite(first) || !Number.isFinite(requested)) return false;
  return first <= requested + START_COVERAGE_TOLERANCE_DAYS * 86_400_000;
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
  const universe = await listDaaAssetUniverse();
  let assetKeys: string[];
  if (req.assetKeys && req.assetKeys.length > 0) {
    assetKeys = req.assetKeys;
  } else {
    assetKeys = universe.map((r) => r.assetKey);
  }

  if (assetKeys.length === 0) {
    return { total: 0, completed: 0, failed: [], rowsInserted: 0, rowsWritten: 0, rowsCovered: 0, rowsReused: 0 };
  }

  // 2. 计算日期范围
  const days = RANGE_DAYS[req.range] ?? 365;
  const now = new Date();
  const startDate = toIsoDate(new Date(now.getTime() - days * 86_400_000));

  const result: BackfillResult = {
    total: assetKeys.length,
    completed: 0,
    failed: [],
    rowsInserted: 0,
    rowsWritten: 0,
    rowsCovered: 0,
    rowsReused: 0,
  };

  // 4. 并发回填
  await runWithConcurrency(assetKeys, MAX_CONCURRENCY, async (assetKey) => {
    const parsed = parseDaaAssetKey(assetKey);
    if (!parsed) {
      result.failed.push({ assetKey, error: "无法解析 assetKey" });
      return;
    }

    try {
      const universeRow = universe.find((row) => row.assetKey.toUpperCase() === assetKey.toUpperCase()) ?? null;
      const market = universeRow?.market || parsed.market;
      const currency = universeRow?.currency || "USD";
      const yfinanceSymbol = toYfinanceSymbolByMarket(universeRow?.symbol || parsed.symbol, market);
      if (!yfinanceSymbol) {
        result.failed.push({ assetKey, error: "无法映射 Yahoo symbol" });
        return;
      }

      const cacheResult = await fetchPriceSeriesWithCache(yfinanceSymbol, startDate, {
        market,
        currency,
        interval: req.interval,
        adjusted: false,
        requireOhlcv: true,
        minDbDays: 15,
        maxStaleDays: 2,
        timeoutMs: 12_000,
        writeMode: "sync",
      });

      if (cacheResult.data.length === 0) {
        result.failed.push({ assetKey, error: cacheResult.error || "Yahoo 返回 0 条 OHLCV 数据" });
        return;
      }

      if (!coversStartDate(cacheResult.data[0]?.date, startDate)) {
        result.failed.push({ assetKey, error: `OHLCV 数据未覆盖目标起始日期 ${startDate}` });
        return;
      }

      const rowsWritten = cacheResult.rowsWritten ?? 0;
      const rowsCovered = cacheResult.rowsCovered ?? cacheResult.data.length;
      result.rowsWritten += rowsWritten;
      result.rowsInserted += rowsWritten;
      result.rowsCovered += rowsCovered;
      result.rowsReused += Math.max(0, rowsCovered - rowsWritten);
      result.completed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logSwallowed(`historyBackfill.${assetKey}`, err);
      result.failed.push({ assetKey, error: message });
    }
  });

  return result;
}
