/**
 * 组合风险指标计算 — 纯算法模块，无副作用，无外部依赖
 *
 * 计算内容：
 * - 波动率（年化、日度）
 * - 风险价值（VaR 和 CVaR）
 * - 风险调整收益（Sharpe、Sortino、Calmar）
 * - 回撤指标（最大回撤、当前回撤、回撤时长）
 * - 集中度（HHI、前3大权重和）
 * - 相关性（平均相关系数、高相关对）
 * - 压力测试
 */

/**
 * 组合风险指标结果
 */
export interface PortfolioRiskMetrics {
  // 波动率
  annualizedVolatility: number; // 年化波动率 (%)
  dailyVolatility: number; // 日度波动率 (%)

  // 风险价值
  varHistorical95: number; // 95% VaR（历史法）(%)
  varHistorical99: number; // 99% VaR（历史法）(%)
  cvar95: number; // 95% CVaR / 预期缺口（Expected Shortfall）(%)

  // 风险调整收益
  sharpeRatio: number; // (年化收益率 - 无风险率) / 波动率
  sortinoRatio: number; // (年化收益率 - 无风险率) / 下行偏差
  calmarRatio: number; // 年化收益率 / 最大回撤

  // 回撤指标
  maxDrawdown: number; // 历史最大回撤 (%)
  currentDrawdown: number; // 当前回撤 (%)
  maxDrawdownDuration: number; // 最大回撤持续时间 (天)

  // 集中度
  hhi: number; // Herfindahl-Hirschman 指数 (0-1，越低越分散)
  top3Concentration: number; // 前3大持仓权重和 (%)

  // 相关性
  avgPairwiseCorrelation: number; // 平均两两相关系数
  highCorrelationPairs: Array<{ a: string; b: string; corr: number }>; // 高相关对（绝对值 >= 0.7）
}

/**
 * 压力测试结果
 */
export interface StressTestResult {
  scenario: string; // 场景名称（英文）
  scenarioZh: string; // 场景名称（中文）
  description: string; // 场景描述
  estimatedLoss: number; // 估计损失率 (%)
  estimatedLossAmount: number; // 估计损失金额（基础货币）
  affectedAssets: Array<{ symbol: string; impact: number }>; // 受影响资产及冲击
}

/**
 * 计算组合风险指标
 *
 * @param params 参数对象
 * @param params.dailyReturns 组合日收益率数组 (0.05 = 5% 收益)
 * @param params.riskFreeRate 无风险利率，年化，默认 0.04 (4%)
 * @param params.weights 各资产权重 symbol -> 0-1
 * @param params.assetReturns 各资产日收益率 symbol -> 日收益率数组
 * @returns 风险指标对象
 */
export function computePortfolioRiskMetrics(params: {
  dailyReturns: number[];
  riskFreeRate?: number;
  weights: Map<string, number>;
  assetReturns: Map<string, number[]>;
}): PortfolioRiskMetrics {
  const riskFreeRate = params.riskFreeRate ?? 0.04;
  const dailyReturns = params.dailyReturns.filter((x) => Number.isFinite(x));

  // 计算基础统计
  const annualizedVol = computeAnnualizedVolatility(dailyReturns);
  const dailyVol = computeDailyVolatility(dailyReturns);
  const annualizedReturn = computeAnnualizedReturn(dailyReturns);

  // VaR 和 CVaR
  const varResults = computeValueAtRisk(dailyReturns);

  // Sharpe 和 Sortino
  const sharpe = computeSharpeRatio(annualizedReturn, riskFreeRate, annualizedVol);
  const sortino = computeSortinoRatio(dailyReturns, riskFreeRate, annualizedReturn);

  // 回撤
  const drawdownResults = computeDrawdownMetrics(dailyReturns);
  const calmar = computeCalmarRatio(annualizedReturn, drawdownResults.maxDrawdown);

  // 集中度
  const hhiResults = computeConcentration(params.weights);

  // 相关性
  const correlationResults = computeCorrelationMetrics(params.assetReturns);

  return {
    annualizedVolatility: annualizedVol * 100,
    dailyVolatility: dailyVol * 100,
    varHistorical95: varResults.var95 * 100,
    varHistorical99: varResults.var99 * 100,
    cvar95: varResults.cvar95 * 100,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    calmarRatio: calmar,
    maxDrawdown: drawdownResults.maxDrawdown * 100,
    currentDrawdown: drawdownResults.currentDrawdown * 100,
    maxDrawdownDuration: drawdownResults.maxDrawdownDuration,
    hhi: hhiResults.hhi,
    top3Concentration: hhiResults.top3Concentration * 100,
    avgPairwiseCorrelation: correlationResults.avgPairwiseCorrelation,
    highCorrelationPairs: correlationResults.highCorrelationPairs,
  };
}

/**
 * 计算年化波动率
 * 公式：std(dailyReturns) * sqrt(252)
 */
function computeAnnualizedVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length <= 1) return 0;
  const mean = dailyReturns.reduce((s, x) => s + x, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (dailyReturns.length - 1);
  return Math.sqrt(Math.max(0, variance)) * Math.sqrt(252);
}

/**
 * 计算日度波动率
 */
function computeDailyVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length <= 1) return 0;
  const mean = dailyReturns.reduce((s, x) => s + x, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (dailyReturns.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

/**
 * 计算年化收益率
 */
function computeAnnualizedReturn(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;
  const compounded = dailyReturns.reduce((prod, ret) => prod * (1 + ret), 1);
  return Math.pow(compounded, 252 / dailyReturns.length) - 1;
}

/**
 * 计算 VaR 和 CVaR
 * VaR: 按历史法，找到第 p 分位数
 * CVaR: 比 VaR 更坏的平均值（Expected Shortfall）
 */
function computeValueAtRisk(dailyReturns: number[]): { var95: number; var99: number; cvar95: number } {
  const sorted = [...dailyReturns].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { var95: 0, var99: 0, cvar95: 0 };
  }

  // 95% VaR: 第 5 分位数
  const idx95 = Math.max(0, Math.ceil(sorted.length * 0.05) - 1);
  const var95 = sorted[idx95] ?? 0;

  // 99% VaR: 第 1 分位数
  const idx99 = Math.max(0, Math.ceil(sorted.length * 0.01) - 1);
  const var99 = sorted[idx99] ?? 0;

  // CVaR: VaR 之下的平均值
  const cvarIdx = Math.max(0, Math.ceil(sorted.length * 0.05) - 1);
  const cvarVals = sorted.slice(0, cvarIdx + 1);
  const cvar95 = cvarVals.length > 0 ? cvarVals.reduce((s, x) => s + x, 0) / cvarVals.length : var95;

  return { var95, var99, cvar95 };
}

/**
 * 计算 Sharpe 比率
 */
function computeSharpeRatio(annualizedReturn: number, riskFreeRate: number, annualizedVolatility: number): number {
  if (annualizedVolatility < 1e-10) return 0;
  return (annualizedReturn - riskFreeRate) / annualizedVolatility;
}

/**
 * 计算 Sortino 比率
 * 使用下行偏差而不是标准差
 */
function computeSortinoRatio(dailyReturns: number[], riskFreeRate: number, annualizedReturn: number): number {
  // 计算下行偏差（仅统计负收益）
  const downwardReturns = dailyReturns.filter((x) => x < 0);
  if (downwardReturns.length === 0) {
    // 无负收益，Sortino 比率无法定义或为无穷大
    return 0;
  }

  const downwardVariance = downwardReturns.reduce((s, x) => s + x * x, 0) / downwardReturns.length;
  const downwardDeviation = Math.sqrt(downwardVariance) * Math.sqrt(252);

  if (downwardDeviation < 1e-10) return 0;
  return (annualizedReturn - riskFreeRate) / downwardDeviation;
}

/**
 * 计算 Calmar 比率
 */
function computeCalmarRatio(annualizedReturn: number, maxDrawdown: number): number {
  if (maxDrawdown < 1e-10) return 0;
  return annualizedReturn / Math.abs(maxDrawdown);
}

/**
 * 计算回撤指标：最大回撤、当前回撤、最大回撤时长
 */
function computeDrawdownMetrics(dailyReturns: number[]): {
  maxDrawdown: number;
  currentDrawdown: number;
  maxDrawdownDuration: number;
} {
  if (dailyReturns.length === 0) {
    return { maxDrawdown: 0, currentDrawdown: 0, maxDrawdownDuration: 0 };
  }

  // 从收益率构建权益曲线
  let equity = 1;
  const equityCurve: number[] = [equity];
  for (const ret of dailyReturns) {
    equity *= 1 + ret;
    equityCurve.push(equity);
  }

  let peak = equityCurve[0];
  let peakIdx = 0;
  let maxDD = 0;
  let maxDDStart = 0;
  let maxDDEnd = 0;

  for (let i = 0; i < equityCurve.length; i++) {
    if (equityCurve[i] > peak) {
      peak = equityCurve[i];
      peakIdx = i;
    }
    const dd = peak > 0 ? (peak - equityCurve[i]) / peak : 0;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDStart = peakIdx;
      maxDDEnd = i;
    }
  }

  // 当前回撤
  const currentPeak = Math.max(...equityCurve);
  const currentEquity = equityCurve[equityCurve.length - 1];
  const currentDD = currentPeak > 0 ? (currentPeak - currentEquity) / currentPeak : 0;

  // 回撤持续时长（日数）
  const maxDDDuration = maxDDEnd - maxDDStart;

  return {
    maxDrawdown: maxDD,
    currentDrawdown: currentDD,
    maxDrawdownDuration: maxDDDuration,
  };
}

/**
 * 计算集中度指标
 */
function computeConcentration(weights: Map<string, number>): { hhi: number; top3Concentration: number } {
  const weightVals: number[] = [];
  weights.forEach((w) => {
    if (w > 0 && Number.isFinite(w)) weightVals.push(w);
  });

  // HHI = sum(w_i^2)
  const hhi = weightVals.reduce((sum, w) => sum + w * w, 0);

  // 前3大权重和
  const sorted = [...weightVals].sort((a, b) => b - a);
  const top3 = sorted.slice(0, 3).reduce((s, w) => s + w, 0);

  return { hhi, top3Concentration: top3 };
}

/**
 * 计算相关性指标
 */
function computeCorrelationMetrics(assetReturns: Map<string, number[]>): {
  avgPairwiseCorrelation: number;
  highCorrelationPairs: Array<{ a: string; b: string; corr: number }>;
} {
  const symbols: string[] = [];
  assetReturns.forEach((_, key) => symbols.push(key));
  symbols.sort();
  const highCorrelationPairs: Array<{ a: string; b: string; corr: number }> = [];

  if (symbols.length < 2) {
    return { avgPairwiseCorrelation: 0, highCorrelationPairs: [] };
  }

  let totalCorr = 0;
  let pairCount = 0;

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const returnsA = assetReturns.get(symbols[i]) ?? [];
      const returnsB = assetReturns.get(symbols[j]) ?? [];

      const corr = computePearsonCorrelation(returnsA, returnsB);
      totalCorr += Math.abs(corr);
      pairCount++;

      if (Math.abs(corr) >= 0.7) {
        highCorrelationPairs.push({
          a: symbols[i],
          b: symbols[j],
          corr: Number(corr.toFixed(4)),
        });
      }
    }
  }

  const avgCorr = pairCount > 0 ? totalCorr / pairCount : 0;
  return { avgPairwiseCorrelation: Number(avgCorr.toFixed(4)), highCorrelationPairs };
}

/**
 * 计算 Pearson 相关系数
 */
function computePearsonCorrelation(returnsA: number[], returnsB: number[]): number {
  const commonIdx: number[] = [];
  const n = Math.min(returnsA.length, returnsB.length);

  for (let i = 0; i < n; i++) {
    if (Number.isFinite(returnsA[i]) && Number.isFinite(returnsB[i])) {
      commonIdx.push(i);
    }
  }

  if (commonIdx.length < 20) return 0; // 数据不足

  const valsA = commonIdx.map((i) => returnsA[i]);
  const valsB = commonIdx.map((i) => returnsB[i]);

  const meanA = valsA.reduce((s, v) => s + v, 0) / commonIdx.length;
  const meanB = valsB.reduce((s, v) => s + v, 0) / commonIdx.length;

  let covAB = 0;
  let varA = 0;
  let varB = 0;

  for (let i = 0; i < commonIdx.length; i++) {
    const dA = valsA[i] - meanA;
    const dB = valsB[i] - meanB;
    covAB += dA * dB;
    varA += dA * dA;
    varB += dB * dB;
  }

  const denom = Math.sqrt(varA * varB);
  if (denom < 1e-12) return 0;

  return covAB / denom;
}

/**
 * 计算相关矩阵
 *
 * @param assetReturns 各资产日收益率 symbol -> 日收益率数组
 * @returns 相关矩阵及符号列表
 */
export function computeCorrelationMatrix(assetReturns: Map<string, number[]>): {
  matrix: number[][];
  symbols: string[];
} {
  const symbols: string[] = [];
  assetReturns.forEach((_, key) => symbols.push(key));
  symbols.sort();
  const n = symbols.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  // 对角线为 1
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
  }

  // 计算非对角线相关系数
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const returnsA = assetReturns.get(symbols[i]) ?? [];
      const returnsB = assetReturns.get(symbols[j]) ?? [];
      const corr = computePearsonCorrelation(returnsA, returnsB);

      matrix[i][j] = corr;
      matrix[j][i] = corr; // 对称
    }
  }

  return { matrix, symbols };
}

/**
 * 执行压力测试
 *
 * @param params 参数对象
 * @param params.weights 各资产权重 symbol -> 0-1
 * @param params.assetClasses 各资产分类 symbol -> assetClass
 * @param params.totalEquity 总权益
 * @returns 压力测试结果数组
 */
export function runStressTests(params: {
  weights: Map<string, number>;
  assetClasses: Map<string, string>;
  totalEquity: number;
}): StressTestResult[] {
  interface ScenarioDef {
    scenario: string;
    scenarioZh: string;
    description: string;
    multipliers: Map<string, number>;
  }

  const scenarios: ScenarioDef[] = [
    {
      scenario: "2008_financial_crisis",
      scenarioZh: "2008年金融危机",
      description: "Global financial crisis scenario",
      multipliers: new Map([
        ["EQUITY", -0.5],
        ["ETF", -0.45],
        ["FUND", -0.4],
        ["BOND", 0.1],
        ["COMMODITY", -0.2],
        ["CRYPTO", -0.8],
        ["CURRENCY", 0.05],
      ]),
    },
    {
      scenario: "2020_covid_crash",
      scenarioZh: "2020年新冠暴跌",
      description: "COVID-19 market crash scenario",
      multipliers: new Map([
        ["EQUITY", -0.34],
        ["ETF", -0.3],
        ["FUND", -0.25],
        ["BOND", 0.05],
        ["COMMODITY", -0.03],
        ["CRYPTO", -0.5],
        ["CURRENCY", 0.02],
      ]),
    },
    {
      scenario: "2022_rate_hike_cycle",
      scenarioZh: "2022年加息周期",
      description: "Interest rate hike cycle scenario",
      multipliers: new Map([
        ["EQUITY", -0.25],
        ["ETF", -0.23],
        ["FUND", -0.2],
        ["BOND", -0.15],
        ["COMMODITY", -0.01],
        ["CRYPTO", -0.65],
        ["CURRENCY", 0.08],
      ]),
    },
    {
      scenario: "china_market_crisis",
      scenarioZh: "中国市场危机",
      description: "China-specific market crisis scenario",
      multipliers: new Map([
        ["EQUITY", -0.25],
        ["ETF", -0.3],
        ["FUND", -0.3],
        ["BOND", -0.05],
        ["COMMODITY", -0.1],
        ["CRYPTO", -0.4],
        ["CURRENCY", -0.15],
      ]),
    },
    {
      scenario: "usd_strength",
      scenarioZh: "美元走强",
      description: "US dollar strength scenario",
      multipliers: new Map([
        ["EQUITY", 0.05],
        ["ETF", 0.08],
        ["FUND", 0.05],
        ["BOND", 0.03],
        ["COMMODITY", -0.1],
        ["CRYPTO", -0.3],
        ["CURRENCY", -0.2],
      ]),
    },
  ];

  const results: StressTestResult[] = [];

  for (const scenario of scenarios) {
    let totalLoss = 0;
    const affectedAssets: Array<{ symbol: string; impact: number }> = [];

    const weights = Array.from(params.weights.entries());
    for (const [symbol, weight] of weights) {
      if (weight <= 0) continue;

      const assetClass = params.assetClasses.get(symbol) ?? "OTHER";
      const multiplier = scenario.multipliers.get(assetClass) ?? 0;
      const impact = weight * multiplier;

      totalLoss += impact;
      if (Math.abs(multiplier) > 0.01) {
        affectedAssets.push({ symbol, impact: multiplier });
      }
    }

    results.push({
      scenario: scenario.scenario,
      scenarioZh: scenario.scenarioZh,
      description: scenario.description,
      estimatedLoss: totalLoss,
      estimatedLossAmount: params.totalEquity * totalLoss,
      affectedAssets: affectedAssets.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
    });
  }

  return results;
}
