/**
 * 绩效归因读取服务
 * 从数据库聚合数据并调用核心算法计算绩效归因
 */

import { toFinite as toFiniteNumber, normalizeText } from "@/src/daa/utils/normalize";
import {
  listDaaEquitySnapshots,
  listDaaAssetUniverse,
  listDaaRebalanceCycles,
  getDaaSystemConfig,
} from "@/src/daa/store/daaStorePg";
import { daaPgPool } from "@/src/daa/pg/daaPg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  computePerformanceAttribution,
  computeDecisionAttribution,
  computeTotalReturnFromSeries,
  computePeriodReturnFromSeries,
  type PerformanceSummary,
  type DecisionAttribution,
} from "@/src/core/attribution";

export type AttributionReadModel = {
  period: {
    type: "30d" | "90d" | "1y" | "ytd" | "all";
    startDate: string;
    endDate: string;
  };
  performance: PerformanceSummary;
  decisions: DecisionAttribution[];
  baseCurrency: string;
  loadedAt: string;
};

/**
 * 根据周期参数计算起始日期
 */
function calculateStartDate(period: "30d" | "90d" | "1y" | "ytd" | "all", endDate: Date): Date {
  const start = new Date(endDate);

  if (period === "30d") {
    start.setDate(start.getDate() - 30);
  } else if (period === "90d") {
    start.setDate(start.getDate() - 90);
  } else if (period === "1y") {
    start.setFullYear(start.getFullYear() - 1);
  } else if (period === "ytd") {
    start.setMonth(0);
    start.setDate(1);
  } else if (period === "all") {
    // 设置为很早的日期，让数据库查询返回所有数据
    start.setFullYear(1990);
  }

  return start;
}

/**
 * 格式化为 ISO 日期字符串
 */
function toIsoDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

/**
 * 从权益快照序列中提取给定时间段的数据
 */
function filterEquitySnapshotsByDateRange(
  snapshots: Array<{ ts: string; totalEquity: number }>,
  startDate: string,
  endDate: string,
): Array<{ ts: string; totalEquity: number }> {
  return snapshots.filter((snap) => {
    const ts = snap.ts.split("T")[0];
    return ts >= startDate && ts <= endDate;
  });
}

/**
 * 从 daa_market_price_history_v1 获取资产的期间首尾价格，计算收益率
 */
async function fetchAssetReturns(
  symbols: string[],
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  if (symbols.length === 0) return new Map();

  const pool = daaPgPool();
  const returns = new Map<string, number>();

  try {
    // 查询每个 symbol 在期间内的首日和末日收盘价
    const { rows } = await pool.query<{
      symbol: string;
      first_price: string;
      last_price: string;
    }>(
      `WITH daily AS (
        SELECT symbol,
               (as_of_ts AT TIME ZONE 'UTC')::date::text AS d,
               MAX(price) AS price
        FROM daa_market_price_history_v1
        WHERE symbol = ANY($1)
          AND as_of_ts >= $2::timestamptz
          AND as_of_ts < ($3::date + 1)::timestamptz
          AND price > 0
        GROUP BY symbol, (as_of_ts AT TIME ZONE 'UTC')::date
      ),
      bounds AS (
        SELECT symbol,
               MIN(d) AS first_day,
               MAX(d) AS last_day
        FROM daily
        GROUP BY symbol
        HAVING COUNT(*) >= 2
      )
      SELECT b.symbol,
             d1.price::text AS first_price,
             d2.price::text AS last_price
      FROM bounds b
      JOIN daily d1 ON d1.symbol = b.symbol AND d1.d = b.first_day
      JOIN daily d2 ON d2.symbol = b.symbol AND d2.d = b.last_day`,
      [symbols, startDate, endDate],
    );

    for (const row of rows) {
      const sym = normalizeText(row.symbol).toUpperCase();
      const first = Number(row.first_price);
      const last = Number(row.last_price);
      if (first > 0 && last > 0) {
        returns.set(sym, (last - first) / first);
      }
    }
  } catch (err) {
    logSwallowed("fetchAssetReturns", err);
  }

  return returns;
}

/**
 * 从 daa_market_price_history_v1 获取基准（SPY）的期间收益率
 */
async function fetchBenchmarkReturn(
  startDate: string,
  endDate: string,
): Promise<number | null> {
  const benchmarkSymbols = ["SPY"];
  const returns = await fetchAssetReturns(benchmarkSymbols, startDate, endDate);
  return returns.get("SPY") ?? null;
}

/**
 * 构建绩效归因读取模型
 *
 * @param period 周期选择："30d" | "90d" | "1y" | "ytd" | "all"
 * @returns AttributionReadModel
 */
export async function buildAttributionReadModel(
  period: "30d" | "90d" | "1y" | "ytd" | "all" = "1y",
): Promise<AttributionReadModel> {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  const startDate = calculateStartDate(period, endDate);

  const startDateStr = toIsoDate(startDate);
  const endDateStr = toIsoDate(endDate);

  // 并行加载数据
  const [snapshots, assetRows, cycles, system] = await Promise.all([
    listDaaEquitySnapshots(500),
    listDaaAssetUniverse(),
    listDaaRebalanceCycles(200),
    getDaaSystemConfig(),
  ]);

  const baseCurrency = system.config.strategy.account.baseCurrency || "USD";

  // 筛选时间段内的权益快照
  const periodSnapshots = filterEquitySnapshotsByDateRange(snapshots, startDateStr, endDateStr);

  if (periodSnapshots.length < 2) {
    // 数据不足，返回空的归因
    return {
      period: {
        type: period,
        startDate: startDateStr,
        endDate: endDateStr,
      },
      performance: {
        period: {
          startDate: startDateStr,
          endDate: endDateStr,
          totalReturnPct: 0,
          benchmarkReturnPct: 0,
          excessReturnPct: 0,
        },
        assetAttributions: [],
        topContributors: [],
        topDetractors: [],
        byAssetClass: [],
        byRegion: [],
      },
      decisions: [],
      baseCurrency,
      loadedAt: new Date().toISOString(),
    };
  }

  // 从时间序列获取起始和结束权益
  const sortedSnapshots = [...periodSnapshots].sort((a, b) => a.ts.localeCompare(b.ts));
  const startEquity = toFiniteNumber(sortedSnapshots[0]?.totalEquity, 0);
  const endEquity = toFiniteNumber(sortedSnapshots[sortedSnapshots.length - 1]?.totalEquity, 0);

  if (startEquity <= 0 || endEquity < 0) {
    // 无效的权益数据
    return {
      period: {
        type: period,
        startDate: startDateStr,
        endDate: endDateStr,
      },
      performance: {
        period: {
          startDate: startDateStr,
          endDate: endDateStr,
          totalReturnPct: 0,
          benchmarkReturnPct: 0,
          excessReturnPct: 0,
        },
        assetAttributions: [],
        topContributors: [],
        topDetractors: [],
        byAssetClass: [],
        byRegion: [],
      },
      decisions: [],
      baseCurrency,
      loadedAt: new Date().toISOString(),
    };
  }

  // 从 daa_market_price_history_v1 获取 SPY 基准收益率
  const holdingSymbols = assetRows
    .filter((row) => row.holdingQty > 0)
    .map((row) => row.symbol);

  const [benchmarkReturn, assetReturns] = await Promise.all([
    fetchBenchmarkReturn(startDateStr, endDateStr),
    fetchAssetReturns(holdingSymbols, startDateStr, endDateStr),
  ]);

  // 基准：优先用 SPY 真实数据，兜底用组合收益率
  const portfolioReturnPct = (endEquity - startEquity) / startEquity;
  const benchmarkReturnPct = benchmarkReturn ?? portfolioReturnPct;

  // 构建持仓的归因数据
  const holdings = assetRows
    .filter((row) => row.holdingQty > 0)
    .map((row) => {
      const currentValue = row.holdingQty * row.holdingPrice;
      const avgWeight = currentValue / endEquity;

      // 从 daa_market_price_history_v1 读取资产期间收益率
      const assetReturnPct = assetReturns.get(row.symbol.toUpperCase()) ?? 0;

      return {
        symbol: row.symbol,
        name: row.market,
        assetClass: row.assetClass,
        region: row.region,
        avgWeight,
        returnPct: assetReturnPct,
      };
    });

  // 调用核心算法计算绩效归因
  const performance = computePerformanceAttribution({
    startEquity,
    endEquity,
    holdings,
    benchmarkReturnPct,
  });

  // 计算决策级别的归因
  // 筛选时间段内已执行的重新平衡周期
  const executedCycles = cycles.filter((cycle) => {
    const cycleDate = cycle.createdAt?.split("T")[0];
    return cycleDate && cycleDate >= startDateStr && cycleDate <= endDateStr;
  });

  const decisionAttributions: DecisionAttribution[] = [];
  for (const cycle of executedCycles) {
    // 查找周期执行时的权益快照
    const executionSnapshots = periodSnapshots.filter((snap) => snap.ts >= cycle.createdAt!);
    const after7dSnapshots = executionSnapshots.filter(
      (snap) => {
        const days = Math.floor(
          (Date.parse(snap.ts) - Date.parse(cycle.createdAt!)) / (1000 * 60 * 60 * 24),
        );
        return days >= 6 && days <= 8;
      },
    );

    if (executionSnapshots.length > 0 && after7dSnapshots.length > 0) {
      const equityAtExecution = toFiniteNumber(executionSnapshots[0]?.totalEquity, 0);
      const equityAfter7d = toFiniteNumber(after7dSnapshots[0]?.totalEquity, 0);
      const counterfactualEquity7d = equityAtExecution * (1 + benchmarkReturnPct);

      if (equityAtExecution > 0 && equityAfter7d > 0) {
        const decisionAttribution = computeDecisionAttribution({
          cycles: [
            {
              cycleId: cycle.cycleId,
              executedAt: cycle.createdAt!,
              equityAtExecution,
              equityAfter7d,
              counterfactualEquity7d,
            },
          ],
        });

        decisionAttributions.push(...decisionAttribution);
      }
    }
  }

  // 更新 performance 的起始和结束日期
  performance.period.startDate = startDateStr;
  performance.period.endDate = endDateStr;

  return {
    period: {
      type: period,
      startDate: startDateStr,
      endDate: endDateStr,
    },
    performance,
    decisions: decisionAttributions,
    baseCurrency,
    loadedAt: new Date().toISOString(),
  };
}

/**
 * 建立快速缓存的归因汇总（仅计数和统计）
 * 用于 UI 仪表盘显示
 */
export async function buildAttributionSummary() {
  const model = await buildAttributionReadModel("1y");

  return {
    period: model.period,
    totalReturnPct: model.performance.period.totalReturnPct,
    excessReturnPct: model.performance.period.excessReturnPct,
    assetCount: model.performance.assetAttributions.length,
    topContributor: model.performance.topContributors[0] || null,
    topDetractor: model.performance.topDetractors[0] || null,
    decisionCount: model.decisions.length,
    positiveDecisions: model.decisions.filter((d) => d.verdict === "positive").length,
    baseCurrency: model.baseCurrency,
  };
}
