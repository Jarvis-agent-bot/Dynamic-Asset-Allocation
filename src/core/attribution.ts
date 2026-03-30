/**
 * 组合绩效归因 — 纯算法，无副作用
 * Performance Attribution：资产级别和决策级别的贡献分析
 */

export interface AttributionPeriod {
  startDate: string;
  endDate: string;
  totalReturnPct: number;
  benchmarkReturnPct: number;
  excessReturnPct: number; // alpha
}

export interface AssetAttribution {
  symbol: string;
  name?: string;
  weight: number; // 期间平均权重
  assetReturnPct: number; // 单个资产收益率
  contributionPct: number; // 权重 × 收益率（对组合的贡献）
  allocationEffect: number; // Brinson: (wp - wb) × (rb - rB)
  selectionEffect: number; // Brinson: wb × (rp - rb)
}

export interface DecisionAttribution {
  cycleId: string;
  date: string;
  action: string; // "rebalance" | "hold"
  portfolioValueBefore: number;
  portfolioValueAfter: number; // 7 days later
  impactPct: number; // actual - counterfactual (实际 - 反事实）
  verdict: "positive" | "negative" | "neutral";
}

export interface PerformanceSummary {
  period: AttributionPeriod;
  assetAttributions: AssetAttribution[];
  topContributors: AssetAttribution[]; // 前3个正向贡献
  topDetractors: AssetAttribution[]; // 前3个负向贡献
  byAssetClass: Array<{ assetClass: string; contributionPct: number; weight: number }>;
  byRegion: Array<{ region: string; contributionPct: number; weight: number }>;
}

export function computePerformanceAttribution(params: {
  startEquity: number;
  endEquity: number;
  startDate?: string;
  endDate?: string;
  holdings: Array<{
    symbol: string;
    name?: string;
    assetClass?: string;
    region?: string;
    avgWeight: number;
    returnPct: number;
  }>;
  benchmarkReturnPct: number; // 同期基准收益率，如 SPY
  benchmarkWeights?: Map<string, number>; // Brinson 归因用
}): PerformanceSummary {
  // 验证输入
  if (!Number.isFinite(params.startEquity) || params.startEquity <= 0) {
    throw new Error("startEquity must be positive");
  }
  if (!Number.isFinite(params.endEquity) || params.endEquity < 0) {
    throw new Error("endEquity must be non-negative");
  }
  if (!Number.isFinite(params.benchmarkReturnPct)) {
    throw new Error("benchmarkReturnPct must be finite");
  }

  // 计算组合总收益率
  const totalReturnPct = (params.endEquity - params.startEquity) / params.startEquity;
  const excessReturnPct = totalReturnPct - params.benchmarkReturnPct;

  // 验证权重之和接近 1.0（允许小误差）
  const totalWeight = params.holdings.reduce((sum, h) => sum + h.avgWeight, 0);
  if (totalWeight < 0.9 || totalWeight > 1.1) {
    console.warn(`[attribution] total weight ${totalWeight.toFixed(2)} deviates from 1.0`);
  }

  // 计算单项资产归因
  const assetAttributions = params.holdings.map((holding) => {
    const contribution = holding.avgWeight * holding.returnPct;
    const benchmarkWeight = params.benchmarkWeights?.get(holding.symbol) ?? 0;

    // Brinson 分解：
    // allocationEffect = (portfolio_weight - benchmark_weight) × (benchmark_return - total_benchmark_return)
    // selectionEffect = benchmark_weight × (portfolio_return - benchmark_return)
    // 简化版：不区分 benchmark sector return，直接用 benchmark total return
    const allocationEffect =
      (holding.avgWeight - benchmarkWeight) * (params.benchmarkReturnPct - params.benchmarkReturnPct);
    const selectionEffect = benchmarkWeight * (holding.returnPct - params.benchmarkReturnPct);

    return {
      symbol: holding.symbol,
      name: holding.name,
      weight: holding.avgWeight,
      assetReturnPct: holding.returnPct,
      contributionPct: contribution,
      allocationEffect,
      selectionEffect,
    };
  });

  // 按贡献度排序
  const sorted = [...assetAttributions].sort(
    (a, b) =>
      Math.abs(b.contributionPct) -
      Math.abs(a.contributionPct) ||
      a.symbol.localeCompare(b.symbol),
  );

  // 前3贡献者和前3拖累者
  const topContributors = sorted.filter((a) => a.contributionPct > 0).slice(0, 3);
  const topDetractors = sorted.filter((a) => a.contributionPct < 0).slice(0, 3);

  // 按资产类别聚合
  const byAssetClassMap = new Map<
    string,
    { weight: number; contribution: number }
  >();
  for (const attr of assetAttributions) {
    const ac = attr.name || "OTHER";
    const existing = byAssetClassMap.get(ac) ?? { weight: 0, contribution: 0 };
    byAssetClassMap.set(ac, {
      weight: existing.weight + attr.weight,
      contribution: existing.contribution + attr.contributionPct,
    });
  }

  const byAssetClass = Array.from(byAssetClassMap.entries()).map(([name, stats]) => ({
    assetClass: name,
    weight: stats.weight,
    contributionPct: stats.contribution,
  }));

  // 按地区聚合（如果提供了 region 信息）
  const byRegionMap = new Map<string, { weight: number; contribution: number }>();
  for (const attr of assetAttributions) {
    const region = params.holdings.find((h) => h.symbol === attr.symbol)?.region || "UNKNOWN";
    const existing = byRegionMap.get(region) ?? { weight: 0, contribution: 0 };
    byRegionMap.set(region, {
      weight: existing.weight + attr.weight,
      contribution: existing.contribution + attr.contributionPct,
    });
  }

  const byRegion = Array.from(byRegionMap.entries()).map(([region, stats]) => ({
    region,
    weight: stats.weight,
    contributionPct: stats.contribution,
  }));

  return {
    period: {
      startDate: params.startDate || "",
      endDate: params.endDate || "",
      totalReturnPct,
      benchmarkReturnPct: params.benchmarkReturnPct,
      excessReturnPct,
    },
    assetAttributions,
    topContributors,
    topDetractors,
    byAssetClass,
    byRegion,
  };
}

/**
 * 计算决策级别的归因：对比实际执行结果与反事实基线（无操作情形）
 * 用于评估重新平衡决策本身的价值
 */
export function computeDecisionAttribution(params: {
  cycles: Array<{
    cycleId: string;
    executedAt: string;
    equityAtExecution: number;
    equityAfter7d: number;
    counterfactualEquity7d: number; // 估计的无操作情形下 7 天后的权益
  }>;
}): DecisionAttribution[] {
  return params.cycles.map((cycle) => {
    // 实际执行的 7 天收益率
    const actualReturn7d =
      (cycle.equityAfter7d - cycle.equityAtExecution) /
      cycle.equityAtExecution;

    // 反事实基线（无操作）的 7 天收益率
    const counterfactualReturn7d =
      (cycle.counterfactualEquity7d - cycle.equityAtExecution) /
      cycle.equityAtExecution;

    // 决策影响 = 实际收益率 - 反事实收益率
    const impactPct = actualReturn7d - counterfactualReturn7d;

    // 判断正负
    let verdict: "positive" | "negative" | "neutral";
    if (impactPct > 0.0001) {
      verdict = "positive";
    } else if (impactPct < -0.0001) {
      verdict = "negative";
    } else {
      verdict = "neutral";
    }

    return {
      cycleId: cycle.cycleId,
      date: cycle.executedAt,
      action: "rebalance",
      portfolioValueBefore: cycle.equityAtExecution,
      portfolioValueAfter: cycle.equityAfter7d,
      impactPct,
      verdict,
    };
  });
}

/**
 * 助手函数：从时间序列计算收益率
 * @param series 价格序列，需按日期排序
 * @returns 总收益率（不是百分比）
 */
export function computeTotalReturnFromSeries(
  series: Array<{ date: string; close: number }>,
): number {
  if (!series || series.length < 2) return 0;

  // 按日期排序并去重
  const sorted = [...series]
    .filter((bar) => bar && bar.close && bar.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 2) return 0;

  const start = sorted[0]!.close;
  const end = sorted[sorted.length - 1]!.close;

  return end / start - 1;
}

/**
 * 助手函数：计算期间内的子序列收益率
 * @param series 时间序列
 * @param startDate 开始日期（ISO string）
 * @param endDate 结束日期（ISO string）
 * @returns 期间收益率
 */
export function computePeriodReturnFromSeries(
  series: Array<{ date: string; close: number }>,
  startDate: string,
  endDate: string,
): number {
  if (!series || series.length < 1) return 0;

  const map = new Map<string, number>();
  for (const bar of series) {
    if (bar && bar.close > 0) {
      map.set(bar.date, bar.close);
    }
  }

  const startClose = map.get(startDate);
  const endClose = map.get(endDate);

  if (startClose === undefined || endClose === undefined) return 0;
  if (startClose <= 0 || endClose <= 0) return 0;

  return endClose / startClose - 1;
}
