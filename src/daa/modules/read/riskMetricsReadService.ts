/**
 * 风险指标读取服务
 * 负责从存储层获取数据，调用核心风险计算函数，组装响应
 */

import { daaPgPool } from "@/src/daa/pg/daaPg";
import { ensureDaaStoreSchemaPg } from "@/src/daa/store/storeSchema";
import { computePortfolioRiskMetrics, runStressTests } from "@/src/core/riskMetrics";
import { normalizeText, toFinite } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export interface RiskMetricsReadModel {
  baseCurrency: string;
  portfolio: {
    totalEquity: number;
    cash: number;
    holdingsValue: number;
  };
  positions: Array<{
    symbol: string;
    market: string;
    qty: number;
    price: number;
    currency: string;
    assetClass: string;
  }>;
  riskMetrics: {
    annualizedVolatility: number;
    dailyVolatility: number;
    varHistorical95: number;
    varHistorical99: number;
    cvar95: number;
    sharpeRatio: number;
    sortinoRatio: number;
    calmarRatio: number;
    maxDrawdown: number;
    currentDrawdown: number;
    maxDrawdownDuration: number;
    hhi: number;
    top3Concentration: number;
    avgPairwiseCorrelation: number;
    highCorrelationPairs: Array<{ a: string; b: string; corr: number }>;
  } | null;
  stressTests: Array<{
    scenario: string;
    scenarioZh: string;
    description: string;
    estimatedLoss: number;
    estimatedLossAmount: number;
    affectedAssets: Array<{ symbol: string; impact: number }>;
  }>;
  warnings: string[];
  generatedAt: string;
}

/**
 * 从市场缓存获取资产价格历史
 */
async function fetchPriceHistoryForSymbols(
  symbols: string[],
  lookbackDays: number,
): Promise<Map<string, { date: string; price: number }[]>> {
  if (symbols.length === 0) return new Map();

  const pool = daaPgPool();
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { rows } = await pool.query<{
      symbol: string;
      as_of_date: string;
      price: string;
    }>(
      `SELECT symbol,
              (as_of_ts AT TIME ZONE 'UTC')::date::text AS as_of_date,
              MAX(price) AS price
       FROM daa_market_price_history_v1
       WHERE symbol = ANY($1)
         AND as_of_ts >= $2::timestamptz
         AND price > 0
       GROUP BY symbol, (as_of_ts AT TIME ZONE 'UTC')::date
       ORDER BY symbol, as_of_date`,
      [symbols, cutoff],
    );

    const result = new Map<string, { date: string; price: number }[]>();
    for (const row of rows) {
      const sym = normalizeText(row.symbol).toUpperCase();
      if (!result.has(sym)) result.set(sym, []);
      result.get(sym)!.push({
        date: row.as_of_date,
        price: Number(row.price),
      });
    }

    return result;
  } catch (err) {
    logSwallowed("fetchPriceHistoryForSymbols", err);
    return new Map();
  }
}

/**
 * 从日收益率序列计算日收益率
 */
function computeReturnsFromPrices(prices: { date: string; price: number }[]): number[] {
  const returns: number[] = [];
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 1; i < sorted.length; i++) {
    const prevPrice = sorted[i - 1].price;
    const currPrice = sorted[i].price;
    if (prevPrice > 0 && currPrice > 0) {
      returns.push(Math.log(currPrice / prevPrice));
    }
  }

  return returns;
}

/**
 * 获取当前账户权益和持仓信息
 */
async function getCurrentAccountState(): Promise<{
  baseCurrency: string;
  totalEquity: number;
  cash: number;
  holdingsValue: number;
  positions: Array<{
    symbol: string;
    market: string;
    qty: number;
    price: number;
    currency: string;
    assetClass: string;
    assetKey: string;
  }>;
}> {
  const pool = daaPgPool();

  // 获取账户元数据和最新权益快照
  const [accountResult, equityResult, positionsResult] = await Promise.all([
    pool.query<{ base_currency: string }>(
      `SELECT COALESCE(config->'strategy'->'account'->>'baseCurrency', 'USD') AS base_currency
       FROM daa_system_config_v2 WHERE id = 'default' LIMIT 1`,
    ),
    pool.query<{ total_equity: string; holdings_value: string; cash: string }>(
      `SELECT total_equity, holdings_value, cash
       FROM daa_equity_snapshots_v2
       ORDER BY ts DESC LIMIT 1`,
    ),
    pool.query<{
      asset_key: string;
      symbol: string;
      market: string;
      qty: string;
      price: string;
      currency: string;
      asset_class: string;
    }>(
      `SELECT
         u.asset_key, u.symbol, u.market, u.currency, u.asset_class,
         COALESCE(p.qty, 0)::numeric AS qty,
         COALESCE(p.price, 0)::numeric AS price
       FROM daa_asset_universe u
       LEFT JOIN daa_positions_v2 p ON p.asset_key = u.asset_key
       WHERE COALESCE(p.qty, 0) > 0
       ORDER BY u.symbol ASC, u.market ASC`,
    ),
  ]);

  const baseCurrency = accountResult.rows[0]?.base_currency || "USD";
  const totalEquity = toFinite(equityResult.rows[0]?.total_equity ?? 0);
  const cash = toFinite(equityResult.rows[0]?.cash ?? 0);
  const holdingsValue = toFinite(equityResult.rows[0]?.holdings_value ?? 0);

  const positions = positionsResult.rows.map((row) => ({
    symbol: normalizeText(row.symbol).toUpperCase(),
    market: normalizeText(row.market, "US").toUpperCase(),
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    assetClass: normalizeText(row.asset_class, "EQUITY").toUpperCase(),
    assetKey: normalizeText(row.asset_key).toUpperCase(),
    qty: toFinite(row.qty),
    price: toFinite(row.price),
  }));

  return {
    baseCurrency,
    totalEquity,
    cash,
    holdingsValue,
    positions,
  };
}

/**
 * 构建风险指标读取模型
 */
export async function buildRiskMetricsReadModel(input: {
  lookbackDays?: number;
  highCorrelationThreshold?: number;
} = {}): Promise<RiskMetricsReadModel> {
  await ensureDaaStoreSchemaPg();

  const lookbackDays = Math.max(20, Math.min(1000, Math.trunc(input.lookbackDays ?? 252)));
  const highCorrelationThreshold = Math.max(0.5, Math.min(0.99, input.highCorrelationThreshold ?? 0.7));

  const warnings: string[] = [];
  let riskMetrics = null;
  const stressTests = [];

  // 空组合兜底
  const emptyResult: RiskMetricsReadModel = {
    baseCurrency: "USD",
    portfolio: { totalEquity: 0, cash: 0, holdingsValue: 0 },
    positions: [],
    riskMetrics: null,
    stressTests: [],
    warnings: ["组合无持仓或总价值为零"],
    generatedAt: new Date().toISOString(),
  };

  let accountState: Awaited<ReturnType<typeof getCurrentAccountState>>;
  try {
    accountState = await getCurrentAccountState();
  } catch (err) {
    logSwallowed("buildRiskMetricsReadModel:getCurrentAccountState", err);
    return emptyResult;
  }

  if (accountState.positions.length === 0) {
    return {
      ...emptyResult,
      baseCurrency: accountState.baseCurrency,
      portfolio: {
        totalEquity: accountState.totalEquity,
        cash: accountState.cash,
        holdingsValue: accountState.holdingsValue,
      },
    };
  }

  try {
    // 获取价格历史
    const symbols = accountState.positions.map((p) => `${p.market}:${p.symbol}`);
    const priceHistories = await fetchPriceHistoryForSymbols(symbols, lookbackDays);

    // 计算权重和收益率
    const weights = new Map<string, number>();
    const assetReturns = new Map<string, number[]>();
    const assetClasses = new Map<string, string>();

    let totalValue = 0;
    for (const pos of accountState.positions) {
      const value = pos.qty * pos.price;
      totalValue += value;
    }

    const portfolioDailyReturns: number[] = [];

    if (totalValue > 0) {
      for (const pos of accountState.positions) {
        const posValue = pos.qty * pos.price;
        const weight = posValue / totalValue;
        weights.set(pos.symbol, weight);
        assetClasses.set(pos.symbol, pos.assetClass);

        const assetKey = `${pos.market}:${pos.symbol}`;
        const prices = priceHistories.get(assetKey) ?? [];

        if (prices.length < 2) {
          warnings.push(`资产 ${pos.symbol} 价格历史不足，将跳过相关计算`);
        } else {
          const returns = computeReturnsFromPrices(prices);
          assetReturns.set(pos.symbol, returns);
        }
      }

      // 计算组合日收益率
      if (assetReturns.size > 0) {
        const allDates = new Set<string>();
        const priceHistoriesArray = Array.from(priceHistories.values());
        for (const prices of priceHistoriesArray) {
          for (const p of prices) {
            allDates.add(p.date);
          }
        }

        const sortedDates = Array.from(allDates).sort();

        for (let i = 1; i < sortedDates.length; i++) {
          const prevDate = sortedDates[i - 1];
          const currDate = sortedDates[i];

          let dayReturn = 0;
          let hasAllReturns = true;

          for (const pos of accountState.positions) {
            const assetKey = `${pos.market}:${pos.symbol}`;
            const prices = priceHistories.get(assetKey) ?? [];
            const priceMap = new Map(prices.map((p) => [p.date, p.price]));

            const prevPrice = priceMap.get(prevDate);
            const currPrice = priceMap.get(currDate);

            if (prevPrice && currPrice && prevPrice > 0) {
              const assetReturn = Math.log(currPrice / prevPrice);
              const weight = weights.get(pos.symbol) ?? 0;
              dayReturn += weight * assetReturn;
            } else {
              hasAllReturns = false;
            }
          }

          if (hasAllReturns) {
            portfolioDailyReturns.push(dayReturn);
          }
        }

        if (portfolioDailyReturns.length >= 20) {
          riskMetrics = computePortfolioRiskMetrics({
            dailyReturns: portfolioDailyReturns,
            riskFreeRate: 0.04,
            weights,
            assetReturns,
          });
        } else {
          warnings.push(`组合日收益率数据不足 (${portfolioDailyReturns.length} 天)，需要至少 20 天`);
        }
      } else {
        warnings.push("无足够的价格历史数据来计算风险指标");
      }

      // 压力测试
      const stressResults = runStressTests({
        weights,
        assetClasses,
        totalEquity: accountState.totalEquity,
      });
      stressTests.push(...stressResults);
    } else {
      warnings.push("组合无持仓或总价值为零");
    }

    return {
      baseCurrency: accountState.baseCurrency,
      portfolio: {
        totalEquity: accountState.totalEquity,
        cash: accountState.cash,
        holdingsValue: accountState.holdingsValue,
      },
      positions: accountState.positions,
      riskMetrics,
      stressTests,
      warnings,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logSwallowed("buildRiskMetricsReadModel", error);
    return {
      ...emptyResult,
      baseCurrency: accountState.baseCurrency,
      portfolio: {
        totalEquity: accountState.totalEquity,
        cash: accountState.cash,
        holdingsValue: accountState.holdingsValue,
      },
    };
  }
}
