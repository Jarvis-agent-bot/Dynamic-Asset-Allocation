/**
 * 基准对比服务 — 计算组合 vs SPY vs 60/40 的归一化收益曲线
 *
 * daa_price_history 表中 symbol 列存储的是 assetKey 格式（如 "US:SPY"），
 * 此服务查询 SPY 和 BND 的历史价格，与权益快照对齐后归一化为 100 基准。
 */

import { withDaaPgClient } from "@/src/daa/store/storeShared";

export type BenchmarkDataPoint = {
  date: string; // YYYY-MM-DD
  portfolio: number; // 归一化 % (100 = 起始)
  spy: number | null;
  balanced: number | null; // 60% SPY + 40% BND
};

export type BenchmarkSummary = {
  data: BenchmarkDataPoint[];
  excessVsSpy: number | null;
  excessVsBalanced: number | null;
};

const SPY_KEY = "US:SPY";
const BND_KEY = "US:BND";

/**
 * 根据权益快照和市场价格历史，构建归一化的基准对比数据。
 *
 * 如果 daa_price_history 中没有 SPY/BND 数据，spy 和 balanced 字段会返回 null，
 * 前端可以优雅降级为仅显示组合曲线。
 */
export async function buildBenchmarkComparison(
  snapshots: Array<{ ts: string; totalEquity: number }>,
  days?: number,
): Promise<BenchmarkSummary> {
  if (snapshots.length === 0) {
    return { data: [], excessVsSpy: null, excessVsBalanced: null };
  }

  // 按时间排序并截取范围
  const sorted = [...snapshots].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
  );
  const cutoff = days
    ? new Date(Date.now() - days * 86_400_000).toISOString()
    : null;
  const filtered = cutoff
    ? sorted.filter((s) => s.ts >= cutoff)
    : sorted;

  if (filtered.length === 0) {
    return { data: [], excessVsSpy: null, excessVsBalanced: null };
  }

  const startDate = filtered[0].ts;

  // 查询 SPY 和 BND 价格历史
  let spyPrices: Map<string, number> = new Map();
  let bndPrices: Map<string, number> = new Map();

  try {
    const rows = await withDaaPgClient(async ({ query }) => {
      const result = await query(
        `SELECT symbol, date_trunc('day', ts)::date AS day, (array_agg(price ORDER BY ts DESC))[1] AS close_price
         FROM daa_price_history
         WHERE symbol IN ($1, $2) AND ts >= $3
         GROUP BY symbol, date_trunc('day', ts)::date
         ORDER BY day`,
        [SPY_KEY, BND_KEY, startDate],
      );
      return result.rows as Array<{
        symbol: string;
        day: string | Date;
        close_price: number | string;
      }>;
    });

    for (const row of rows) {
      const dayStr = toDateStr(row.day);
      const price = Number(row.close_price);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (row.symbol === SPY_KEY) spyPrices.set(dayStr, price);
      else if (row.symbol === BND_KEY) bndPrices.set(dayStr, price);
    }
  } catch {
    // 表不存在或查询失败 — 降级为仅组合曲线
    spyPrices = new Map();
    bndPrices = new Map();
  }

  // 构建归一化数据点
  const baseEquity = filtered[0].totalEquity || 1;
  const spyDays = [...spyPrices.keys()].sort();
  const bndDays = [...bndPrices.keys()].sort();
  const baseSpy = spyDays.length > 0 ? spyPrices.get(spyDays[0])! : null;
  const baseBnd = bndDays.length > 0 ? bndPrices.get(bndDays[0])! : null;

  const data: BenchmarkDataPoint[] = filtered.map((snap) => {
    const dayStr = toDateStr(snap.ts);
    const portfolio = (snap.totalEquity / baseEquity) * 100;

    let spy: number | null = null;
    if (baseSpy) {
      const spyPrice = findClosestPrice(spyPrices, dayStr);
      if (spyPrice !== null) spy = (spyPrice / baseSpy) * 100;
    }

    let balanced: number | null = null;
    if (baseSpy && baseBnd) {
      const spyPrice = findClosestPrice(spyPrices, dayStr);
      const bndPrice = findClosestPrice(bndPrices, dayStr);
      if (spyPrice !== null && bndPrice !== null) {
        const spyReturn = spyPrice / baseSpy;
        const bndReturn = bndPrice / baseBnd;
        balanced = (0.6 * spyReturn + 0.4 * bndReturn) * 100;
      }
    }

    return { date: dayStr, portfolio, spy, balanced };
  });

  // 计算超额收益
  const lastPoint = data[data.length - 1];
  const excessVsSpy =
    lastPoint.spy !== null ? lastPoint.portfolio - lastPoint.spy : null;
  const excessVsBalanced =
    lastPoint.balanced !== null
      ? lastPoint.portfolio - lastPoint.balanced
      : null;

  return { data, excessVsSpy, excessVsBalanced };
}

/* ------------------------------------------------------------------ */
/*  辅助函数                                                           */
/* ------------------------------------------------------------------ */

function toDateStr(v: string | Date): string {
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toISOString().slice(0, 10);
}

/**
 * 在价格 Map 中查找最近的价格（向前查找最多 5 天）。
 */
function findClosestPrice(
  prices: Map<string, number>,
  targetDay: string,
): number | null {
  if (prices.has(targetDay)) return prices.get(targetDay)!;
  // 向前查找最多 5 天
  const d = new Date(targetDay);
  for (let i = 1; i <= 5; i++) {
    d.setDate(d.getDate() - 1);
    const key = d.toISOString().slice(0, 10);
    if (prices.has(key)) return prices.get(key)!;
  }
  return null;
}
