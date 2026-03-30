/**
 * 绩效归因读取服务
 * 从数据库聚合数据并调用核心算法计算绩效归因
 */

import { toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import {
  listDaaEquitySnapshots,
  listDaaAssetUniverse,
  listDaaRebalanceCycles,
  getDaaSystemConfig,
} from "@/src/daa/store/daaStorePg";
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

  // 计算基准收益率（假设使用 S&P 500 / SPY）
  // 简化版：使用组合权益的历史数据作为基准
  // 实际应该从市场数据源获取 SPY 或其他基准的价格序列
  const benchmarkReturnPct = (endEquity - startEquity) / startEquity * 0.9; // 简化：假设基准是 90% 的组合收益

  // 构建持仓的归因数据
  const holdings = assetRows
    .filter((row) => row.holdingQty > 0)
    .map((row) => {
      // 计算每个资产在期间内的平均权重
      const currentValue = row.holdingQty * row.holdingPrice;
      const avgWeight = currentValue / endEquity; // 简化：使用当前权重作为平均权重

      // 计算资产的时间段收益率
      // 由于数据库中没有完整的价格历史，此处使用估计值
      const assetReturnPct = 0; // TODO: 从 market_price_history 读取价格序列

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
