import { randomUUID } from "node:crypto";

import type { PriceBar } from "@/src/core/domain";
import {
  backtestDriftRebalance,
  type DriftRebalanceBacktestRequest,
} from "@/src/core/backtestDriftRebalance";
import { computeBacktestAttribution } from "@/src/core/backtest/attribution";
import {
  buildEqualWeightTargetWeights,
  buildMomentumTargetWeights,
  buildRiskParityTargetWeights,
  buildMinVarianceTargetWeights,
} from "@/src/core/ensemble/strategy";
import { createMarketDataClient } from "@/src/market/marketDataClient";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

import type {
  StrategyLabRunParams,
  StrategyLabRunResult,
  StrategyLabHistoryItem,
  StrategyLabEquityPoint,
} from "./strategyLabTypes";

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/** 将 asset key (MARKET::SYMBOL 或纯 symbol) 解析为 { market, symbol } */
function resolveAsset(raw: string): { market: string; symbol: string } {
  const parsed = parseDaaAssetKey(raw);
  if (parsed) return parsed;
  const symbol = String(raw || "").trim().toUpperCase();
  return { market: "US", symbol };
}

/** 再平衡频率 → 最小间隔秒数 */
function minIntervalSecondsForRebalanceFrequency(freq: string): number {
  switch (freq) {
    case "monthly":
      return 20 * 24 * 3600;
    case "quarterly":
      return 60 * 24 * 3600;
    case "semiannual":
      return 120 * 24 * 3600;
    case "annual":
      return 240 * 24 * 3600;
    default:
      return 20 * 24 * 3600;
  }
}

/** 根据策略名称和价格序列计算目标权重 */
function computeTargetWeights(
  strategy: string,
  symbols: string[],
  seriesBySymbol: Record<string, PriceBar[]>,
): Record<string, number> {
  switch (strategy) {
    case "equalWeight":
    case "baseline":
      return buildEqualWeightTargetWeights(symbols);

    case "momentum": {
      const returns: Record<string, number> = {};
      for (const sym of symbols) {
        const bars = seriesBySymbol[sym] || [];
        if (bars.length < 2) continue;
        const first = bars[0].close;
        const last = bars[bars.length - 1].close;
        if (first > 0 && last > 0) {
          returns[sym] = last / first - 1;
        }
      }
      const weights = buildMomentumTargetWeights(returns);
      // 如果所有资产动量为负，回退到等权
      if (Object.keys(weights).length === 0) {
        return buildEqualWeightTargetWeights(symbols);
      }
      return weights;
    }

    case "riskParity": {
      const volBySymbol: Record<string, number> = {};
      for (const sym of symbols) {
        const bars = seriesBySymbol[sym] || [];
        if (bars.length < 20) continue;
        const rets: number[] = [];
        for (let i = 1; i < bars.length; i++) {
          const prev = bars[i - 1].close;
          const curr = bars[i].close;
          if (prev > 0 && curr > 0) rets.push(curr / prev - 1);
        }
        if (rets.length < 10) continue;
        const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
        const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
        const vol = Math.sqrt(Math.max(0, variance)) * Math.sqrt(252);
        if (vol > 0) volBySymbol[sym] = vol;
      }
      const weights = buildRiskParityTargetWeights(volBySymbol);
      if (Object.keys(weights).length === 0) {
        return buildEqualWeightTargetWeights(symbols);
      }
      return weights;
    }

    case "minVariance": {
      const bars: Record<string, number[]> = {};
      for (const sym of symbols) {
        const series = seriesBySymbol[sym] || [];
        const rets: number[] = [];
        for (let i = 1; i < series.length; i++) {
          const prev = series[i - 1].close;
          const curr = series[i].close;
          if (prev > 0 && curr > 0) rets.push(curr / prev - 1);
        }
        if (rets.length >= 10) bars[sym] = rets;
      }
      const symsWithData = Object.keys(bars);
      if (symsWithData.length < 2) {
        return buildEqualWeightTargetWeights(symbols);
      }
      // 计算协方差矩阵
      const minLen = Math.min(...symsWithData.map((s) => bars[s].length));
      const covMatrix: Record<string, Record<string, number>> = {};
      for (const a of symsWithData) {
        covMatrix[a] = {};
        for (const b of symsWithData) {
          const rA = bars[a].slice(0, minLen);
          const rB = bars[b].slice(0, minLen);
          const meanA = rA.reduce((s, x) => s + x, 0) / rA.length;
          const meanB = rB.reduce((s, x) => s + x, 0) / rB.length;
          let cov = 0;
          for (let i = 0; i < minLen; i++) {
            cov += (rA[i] - meanA) * (rB[i] - meanB);
          }
          covMatrix[a][b] = cov / (minLen - 1);
        }
      }
      const weights = buildMinVarianceTargetWeights(covMatrix);
      if (Object.keys(weights).length === 0) {
        return buildEqualWeightTargetWeights(symbols);
      }
      return weights;
    }

    default:
      return buildEqualWeightTargetWeights(symbols);
  }
}

// ---------------------------------------------------------------------------
// 获取价格历史
// ---------------------------------------------------------------------------

async function fetchPriceHistory(
  assets: Array<{ market: string; symbol: string }>,
  startDate: string,
  endDate: string,
): Promise<{ seriesBySymbol: Record<string, PriceBar[]>; warnings: string[] }> {
  const client = createMarketDataClient();
  const seriesBySymbol: Record<string, PriceBar[]> = {};
  const warnings: string[] = [];

  await Promise.all(
    assets.map(async (asset) => {
      const yfinSymbol = toYfinanceSymbolByMarket(asset.symbol, asset.market);
      if (!yfinSymbol) {
        warnings.push(`无法映射 yfinance symbol: ${asset.market}::${asset.symbol}`);
        return;
      }
      try {
        const bars = await client.yfinance.priceSeriesBars({
          symbol: yfinSymbol,
          start: startDate,
          end: endDate,
          adjusted: true,
        });
        seriesBySymbol[asset.symbol] = bars;
      } catch (err) {
        logSwallowed(`strategyLab.fetchPriceHistory(${yfinSymbol})`, err);
        warnings.push(`获取 ${asset.symbol} 价格历史失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  return { seriesBySymbol, warnings };
}

// ---------------------------------------------------------------------------
// 对齐日期序列
// ---------------------------------------------------------------------------

function alignSeries(
  seriesBySymbol: Record<string, PriceBar[]>,
): Record<string, PriceBar[]> {
  const symbols = Object.keys(seriesBySymbol);
  if (symbols.length <= 1) return seriesBySymbol;

  // 取所有 symbol 的日期交集
  const dateSets = symbols.map((sym) => new Set((seriesBySymbol[sym] || []).map((b) => b.date)));
  let commonDates = dateSets[0];
  for (let i = 1; i < dateSets.length; i++) {
    const next = new Set<string>();
    for (const d of commonDates) {
      if (dateSets[i].has(d)) next.add(d);
    }
    commonDates = next;
  }

  const sortedDates = [...commonDates].sort();
  const aligned: Record<string, PriceBar[]> = {};
  for (const sym of symbols) {
    const byDate = new Map<string, PriceBar>();
    for (const bar of seriesBySymbol[sym] || []) {
      byDate.set(bar.date, bar);
    }
    aligned[sym] = sortedDates
      .map((d) => byDate.get(d))
      .filter((b): b is PriceBar => b != null);
  }

  return aligned;
}

// ---------------------------------------------------------------------------
// 主入口：执行回测
// ---------------------------------------------------------------------------

export async function runStrategyLabBacktest(
  params: StrategyLabRunParams,
): Promise<StrategyLabRunResult> {
  const runId = randomUUID();
  const createdAt = new Date().toISOString();

  // 1. 解析资产
  const assets = (params.assets || []).map(resolveAsset).filter((a) => a.symbol);
  if (!assets.length) throw Object.assign(new Error("至少需要一个资产"), { status: 400 });

  const symbols = assets.map((a) => a.symbol);
  const strategy = (params.strategies || [])[0] || "equalWeight";

  // 2. 获取价格历史
  const { seriesBySymbol: rawSeries, warnings } = await fetchPriceHistory(
    assets,
    params.startDate,
    params.endDate,
  );

  // 过滤无数据的资产
  const availableSymbols = symbols.filter((s) => (rawSeries[s]?.length ?? 0) >= 2);
  if (!availableSymbols.length) {
    throw Object.assign(new Error("所有资产价格历史获取失败，无法执行回测"), { status: 422 });
  }

  // 3. 对齐日期序列
  const filteredSeries: Record<string, PriceBar[]> = {};
  for (const sym of availableSymbols) {
    filteredSeries[sym] = rawSeries[sym];
  }
  const seriesBySymbol = alignSeries(filteredSeries);

  // 4. 计算目标权重
  const targetWeights = computeTargetWeights(strategy, availableSymbols, seriesBySymbol);

  // 5. 执行回测
  const backtestReq: DriftRebalanceBacktestRequest = {
    seriesBySymbol,
    targetWeights,
    initialEquity: params.initialCapital || 10000,
    trigger: {
      driftThresholdPct: 0.05,
      minOrderNotional: 50,
      minRebalanceIntervalSeconds: minIntervalSecondsForRebalanceFrequency(params.rebalanceFrequency || "monthly"),
    },
    execution: {
      timing: "t_plus_1_close",
      feeRateBps: params.feeRateBps ?? 10,
      slippageBps: params.slippageBps ?? 5,
    },
    bootstrapToTarget: true,
    includeEventStates: false,
    includeTimeline: false,
  };

  const backtestResult = backtestDriftRebalance(backtestReq);
  warnings.push(...backtestResult.warnings);

  // 6. 归因分析
  const attribution = computeBacktestAttribution({
    backtest: backtestResult,
    seriesBySymbol: Object.fromEntries(
      Object.entries(seriesBySymbol).map(([sym, bars]) =>
        [sym, bars.map((b) => ({ date: b.date, close: b.close }))],
      ),
    ),
    benchmarkSymbol: params.benchmarkSymbol || "SPY",
  });

  // 7. 构建权益曲线
  const equityCurve: StrategyLabEquityPoint[] = backtestResult.dates.map((date, i) => ({
    date,
    equity: backtestResult.equity[i],
  }));

  // 8. 持久化到数据库
  try {
    await withDaaPgClient(async ({ query }) => {
      await query(
        `INSERT INTO daa_strategy_lab_run_snapshots
           (run_id, created_at, base_currency, start_date, end_date, request_json, summary_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          runId,
          createdAt,
          "USD",
          params.startDate,
          params.endDate,
          JSON.stringify(params),
          JSON.stringify({
            metrics: backtestResult.metrics,
            summary: backtestResult.summary,
            strategy,
            symbolCount: availableSymbols.length,
          }),
        ],
      );
    });
  } catch (err) {
    logSwallowed("strategyLab.saveSnapshot", err);
    warnings.push("回测结果保存失败，但计算结果仍然可用");
  }

  return {
    runId,
    createdAt,
    params,
    equityCurve,
    metrics: backtestResult.metrics,
    attribution,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 查询历史
// ---------------------------------------------------------------------------

export async function listStrategyLabHistory(
  limit = 20,
): Promise<StrategyLabHistoryItem[]> {
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT run_id, created_at, base_currency, start_date, end_date, request_json, summary_json
       FROM daa_strategy_lab_run_snapshots
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(100, Math.trunc(limit)))],
    );

    return (result.rows || []).map((row: Record<string, unknown>) => {
      const requestJson = typeof row.request_json === "string"
        ? JSON.parse(row.request_json)
        : (row.request_json || {});
      const summaryJson = typeof row.summary_json === "string"
        ? JSON.parse(row.summary_json)
        : (row.summary_json || {});

      return {
        runId: String(row.run_id || ""),
        createdAt: String(row.created_at || ""),
        baseCurrency: String(row.base_currency || "USD"),
        startDate: String(row.start_date || ""),
        endDate: String(row.end_date || ""),
        params: requestJson as StrategyLabRunParams,
        metrics: (summaryJson as Record<string, unknown>).metrics as StrategyLabHistoryItem["metrics"],
      };
    });
  });
}
