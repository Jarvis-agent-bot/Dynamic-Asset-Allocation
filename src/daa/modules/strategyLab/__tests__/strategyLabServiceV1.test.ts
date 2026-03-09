import { beforeEach, describe, expect, it } from "vitest";

import { getDaaSystemConfigV2, listDaaAssetUniverseV1, saveDaaSystemConfigV2, upsertDaaAssetUniverseRowV1 } from "@/src/daa/store/daaStorePgV1";
import { runStrategyLabV1, writeStrategyLabTargetWeightsV1 } from "../strategyLabServiceV1";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntimeV1() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as Record<string, unknown>)[PG_GLOBAL_KEY];
  delete (globalThis as Record<string, unknown>)[STORE_GLOBAL_KEY];
}

function createMarketDataClientV1(seriesMap: Record<string, Array<{ date: string; close: number }>>) {
  return {
    yfinance: {
      async priceSeriesBars(params: { symbol: string }) {
        const rows = seriesMap[params.symbol];
        if (!rows) throw new Error(`missing symbol ${params.symbol}`);
        return rows;
      },
    },
  } as any;
}

describe("strategyLabServiceV1", () => {
  beforeEach(() => {
    resetPgMemRuntimeV1();
  });

  it("runs strategy lab with walk-forward candidates and benchmark scores", async () => {
    const marketDataClient = createMarketDataClientV1({
      AAPL: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 102 },
        { date: "2025-01-03", close: 105 },
        { date: "2025-01-06", close: 107 },
      ],
      MSFT: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 99 },
        { date: "2025-01-03", close: 101 },
        { date: "2025-01-06", close: 104 },
      ],
      SPY: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 101 },
        { date: "2025-01-03", close: 102 },
        { date: "2025-01-06", close: 103 },
      ],
    });

    const result = await runStrategyLabV1({
      assets: [
        {
          assetKey: "US::AAPL",
          symbol: "AAPL",
          market: "US",
          currency: "USD",
          yfinanceSymbol: "AAPL",
          currentTargetWeightPct: 60,
          currentWeightPct: 55,
        },
        {
          assetKey: "US::MSFT",
          symbol: "MSFT",
          market: "US",
          currency: "USD",
          yfinanceSymbol: "MSFT",
          currentTargetWeightPct: 40,
          currentWeightPct: 45,
        },
      ],
      startDate: "2025-01-01",
      endDate: "2025-01-06",
      benchmarkSymbol: "SPY",
      alignmentMode: "intersection",
      minBars: 2,
      lookbackBars: 2,
      initialEquity: 10000,
      constraints: { maxPositionPct: 0.7, maxOrderPctOfNav: 1, minNotional: 0 },
      policy: { thresholdPct: 0.05, minTradeNotional: 0, cooldownSeconds: 0 },
      execution: { timing: "t_plus_1_close", feeRateBps: 0, slippageBps: 0 },
    }, { marketDataClient });

    expect(result.baseCurrency).toBe("USD");
    expect(result.lookbackBars).toBe(2);
    expect(result.assetsUsed.map((item) => item.assetKey)).toEqual(["US::AAPL", "US::MSFT"]);
    expect(result.candidates.map((item) => item.id)).toEqual([
      "baseline",
      "momentum",
      "riskParity",
      "minVariance",
      "equalWeight",
      "ensemble",
    ]);
    expect(result.benchmark.symbol).toBe("SPY");
    expect(result.benchmark.equity.length).toBe(result.candidates[0].backtest.equity.length);
    expect(result.defaultScenarioId).toBe("executable");
    expect(result.scenarios.map((item) => item.scenarioId)).toEqual(["executable", "ideal"]);
    expect(result.candidateComparisons).toHaveLength(6);
    expect(result.candidateComparisons.every((item) => item.sourceBreakdown.length === 4)).toBe(true);
    expect(result.candidates.every((item) => Number.isFinite(item.score))).toBe(true);
  });

  it("keeps executable friction separate from the ideal scenario", async () => {
    const marketDataClient = createMarketDataClientV1({
      AAA: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 200 },
        { date: "2025-01-03", close: 200 },
        { date: "2025-01-06", close: 200 },
      ],
      BBB: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 100 },
        { date: "2025-01-03", close: 100 },
        { date: "2025-01-06", close: 100 },
      ],
      SPY: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 101 },
        { date: "2025-01-03", close: 101 },
        { date: "2025-01-06", close: 101 },
      ],
    });

    const result = await runStrategyLabV1({
      assets: [
        {
          assetKey: "US::AAA",
          symbol: "AAA",
          market: "US",
          currency: "USD",
          yfinanceSymbol: "AAA",
          currentTargetWeightPct: 50,
          currentWeightPct: 50,
        },
        {
          assetKey: "US::BBB",
          symbol: "BBB",
          market: "US",
          currency: "USD",
          yfinanceSymbol: "BBB",
          currentTargetWeightPct: 50,
          currentWeightPct: 50,
        },
      ],
      startDate: "2025-01-01",
      endDate: "2025-01-06",
      benchmarkSymbol: "SPY",
      alignmentMode: "intersection",
      minBars: 2,
      lookbackBars: 2,
      initialEquity: 200,
      constraints: { maxPositionPct: 1, maxOrderPctOfNav: 0.25, minNotional: 0 },
      policy: { thresholdPct: 0.1, minTradeNotional: 40, cooldownSeconds: 0 },
      execution: { timing: "t_plus_1_close", feeRateBps: 100, slippageBps: 10 },
    }, { marketDataClient });

    const executable = result.scenarios.find((item) => item.scenarioId === "executable");
    const ideal = result.scenarios.find((item) => item.scenarioId === "ideal");

    expect(executable).toBeTruthy();
    expect(ideal).toBeTruthy();
    expect(executable?.execution.feeRateBps).toBeCloseTo(100, 8);
    expect(ideal?.execution.feeRateBps).toBe(0);
    expect(ideal?.execution.slippageBps).toBe(0);
    expect(ideal?.policy.minTradeNotional).toBe(0);
    expect(ideal?.constraints.minNotional).toBe(0);
    expect(ideal?.constraints.maxOrderPctOfNav).toBe(1);

    const executableWarnings = executable?.candidates.flatMap((item) => item.backtest.warnings) || [];
    const idealWarnings = ideal?.candidates.flatMap((item) => item.backtest.warnings) || [];

    expect(executableWarnings.some((warning) => warning.includes("constraints.maxIn=") || warning.includes("constraints.maxOut=") || warning.includes("blocks all trades") || warning.includes("min order size"))).toBe(true);
    expect(idealWarnings.some((warning) => warning.includes("constraints.maxIn=") || warning.includes("constraints.maxOut=") || warning.includes("blocks all trades") || warning.includes("min order size"))).toBe(false);

    const executableBaseline = executable?.candidates.find((item) => item.id === "baseline");
    const idealBaseline = ideal?.candidates.find((item) => item.id === "baseline");
    const baselineComparison = result.candidateComparisons.find((item) => item.candidateId === "baseline");

    expect(executableBaseline?.backtest.summary.turnoverNotional || 0).toBeLessThan(idealBaseline?.backtest.summary.turnoverNotional || 0);
    expect(executableBaseline?.backtest.summary.totalFeesAbs || 0).toBeGreaterThan(0);
    expect(idealBaseline?.backtest.summary.totalFeesAbs || 0).toBe(0);
    expect(baselineComparison?.sourceBreakdown.map((item) => item.sourceId)).toEqual(["fee", "slippage", "tradeFloor", "tradeCaps"]);
    expect((baselineComparison?.sourceBreakdown || []).some((item) => Math.abs(item.returnImpact) > 1e-8)).toBe(true);
    expect((baselineComparison?.sourceBreakdown || []).reduce((sum, item) => sum + item.returnImpact, 0)).toBeCloseTo(baselineComparison?.executionGap || 0, 8);
  });

  it("uses shared execution defaults from system config when the request does not override them", async () => {
    const current = await getDaaSystemConfigV2();
    await saveDaaSystemConfigV2({
      baseVersion: current.version,
      config: {
        ...current.config,
        strategy: {
          ...current.config.strategy,
          constraints: {
            ...current.config.strategy.constraints,
            maxOrderPctOfNav: 0.15,
          },
          execution: {
            ...current.config.strategy.execution,
            feeRateBps: 12,
            slippageBps: 8,
            timing: "t_plus_1_close",
          },
        },
      },
    });

    const marketDataClient = createMarketDataClientV1({
      AAA: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 101 },
        { date: "2025-01-03", close: 102 },
        { date: "2025-01-06", close: 103 },
      ],
      BBB: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 99 },
        { date: "2025-01-03", close: 98 },
        { date: "2025-01-06", close: 97 },
      ],
      SPY: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 100 },
        { date: "2025-01-03", close: 100 },
        { date: "2025-01-06", close: 100 },
      ],
    });

    const result = await runStrategyLabV1({
      assets: [
        { assetKey: "US::AAA", symbol: "AAA", market: "US", currency: "USD", yfinanceSymbol: "AAA", currentTargetWeightPct: 50, currentWeightPct: 50 },
        { assetKey: "US::BBB", symbol: "BBB", market: "US", currency: "USD", yfinanceSymbol: "BBB", currentTargetWeightPct: 50, currentWeightPct: 50 },
      ],
      startDate: "2025-01-01",
      endDate: "2025-01-06",
      benchmarkSymbol: "SPY",
      alignmentMode: "intersection",
      minBars: 2,
      lookbackBars: 2,
      initialEquity: 10000,
    }, { marketDataClient });

    const executable = result.scenarios.find((item) => item.scenarioId === "executable");
    expect(executable?.constraints.maxOrderPctOfNav).toBeCloseTo(0.15, 8);
    expect(executable?.execution.feeRateBps).toBeCloseTo(12, 8);
    expect(executable?.execution.slippageBps).toBeCloseTo(8, 8);
  });

  it("converts mixed USD/HKD/CNY assets into the system base currency before backtesting", async () => {
    const marketDataClient = createMarketDataClientV1({
      AAPL: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 102 },
        { date: "2025-01-03", close: 103 },
        { date: "2025-01-06", close: 104 },
      ],
      "0700.HK": [
        { date: "2025-01-01", close: 780 },
        { date: "2025-01-02", close: 782 },
        { date: "2025-01-03", close: 790 },
        { date: "2025-01-06", close: 800 },
      ],
      "600519.SS": [
        { date: "2025-01-01", close: 1500 },
        { date: "2025-01-02", close: 1510 },
        { date: "2025-01-03", close: 1520 },
        { date: "2025-01-06", close: 1530 },
      ],
      "HKDUSD=X": [
        { date: "2025-01-01", close: 0.128 },
        { date: "2025-01-02", close: 0.128 },
        { date: "2025-01-03", close: 0.128 },
        { date: "2025-01-06", close: 0.128 },
      ],
      "CNYUSD=X": [
        { date: "2025-01-01", close: 0.138 },
        { date: "2025-01-02", close: 0.138 },
        { date: "2025-01-03", close: 0.138 },
        { date: "2025-01-06", close: 0.138 },
      ],
      SPY: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 101 },
        { date: "2025-01-03", close: 102 },
        { date: "2025-01-06", close: 103 },
      ],
    });

    const result = await runStrategyLabV1({
      assets: [
        { assetKey: "US::AAPL", symbol: "AAPL", market: "US", currency: "USD", yfinanceSymbol: "AAPL", currentTargetWeightPct: 34, currentWeightPct: 34 },
        { assetKey: "HK::0700", symbol: "0700", market: "HK", currency: "HKD", yfinanceSymbol: "0700.HK", currentTargetWeightPct: 33, currentWeightPct: 33 },
        { assetKey: "CN::600519", symbol: "600519", market: "CN", currency: "CNY", yfinanceSymbol: "600519.SS", currentTargetWeightPct: 33, currentWeightPct: 33 },
      ],
      startDate: "2025-01-01",
      endDate: "2025-01-06",
      benchmarkSymbol: "SPY",
      alignmentMode: "intersection",
      minBars: 2,
      lookbackBars: 2,
      initialEquity: 10000,
      constraints: { maxPositionPct: 1, maxOrderPctOfNav: 1, minNotional: 0 },
      policy: { thresholdPct: 0.05, minTradeNotional: 0, cooldownSeconds: 0 },
      execution: { timing: "t_plus_1_close", feeRateBps: 0, slippageBps: 0 },
    }, { marketDataClient });

    expect(result.baseCurrency).toBe("USD");
    expect(result.assetsUsed.map((item) => item.assetKey)).toEqual(["US::AAPL", "HK::0700", "CN::600519"]);
    expect(result.benchmark.equity.length).toBeGreaterThan(0);
    expect(result.candidates.every((item) => Number.isFinite(item.backtest.metrics.totalReturn))).toBe(true);
  });

  it("accepts weekend-stamped FX series by carrying forward the latest available close on asset trading days", async () => {
    const marketDataClient = createMarketDataClientV1({
      "0700.HK": [
        { date: "2024-04-02", close: 780 },
        { date: "2024-04-03", close: 782 },
        { date: "2024-04-05", close: 790 },
        { date: "2024-04-08", close: 800 },
      ],
      "HKDUSD=X": [
        { date: "2024-04-02", close: 0.1280 },
        { date: "2024-04-03", close: 0.1281 },
        { date: "2024-04-04", close: 0.1282 },
        { date: "2024-04-07", close: 0.1283 },
        { date: "2024-04-08", close: 0.1284 },
      ],
      SPY: [
        { date: "2024-04-02", close: 100 },
        { date: "2024-04-03", close: 101 },
        { date: "2024-04-05", close: 102 },
        { date: "2024-04-08", close: 103 },
      ],
    });

    const result = await runStrategyLabV1({
      assets: [
        { assetKey: "HK::0700", symbol: "0700", market: "HK", currency: "HKD", yfinanceSymbol: "0700.HK", currentTargetWeightPct: 100, currentWeightPct: 100 },
      ],
      startDate: "2024-04-02",
      endDate: "2024-04-08",
      benchmarkSymbol: "SPY",
      alignmentMode: "intersection",
      minBars: 2,
      lookbackBars: 2,
      initialEquity: 10000,
      constraints: { maxPositionPct: 1, maxOrderPctOfNav: 1, minNotional: 0 },
      policy: { thresholdPct: 0.05, minTradeNotional: 0, cooldownSeconds: 0 },
      execution: { timing: "t_plus_1_close", feeRateBps: 0, slippageBps: 0 },
    }, { marketDataClient });

    expect(result.assetsUsed.map((item) => item.assetKey)).toEqual(["HK::0700"]);
    expect(result.candidates.every((item) => Number.isFinite(item.backtest.metrics.totalReturn))).toBe(true);
  });

  it("blocks when required FX series are missing", async () => {
    const marketDataClient = createMarketDataClientV1({
      "0700.HK": [
        { date: "2025-01-01", close: 780 },
        { date: "2025-01-02", close: 782 },
        { date: "2025-01-03", close: 790 },
        { date: "2025-01-06", close: 800 },
      ],
      SPY: [
        { date: "2025-01-01", close: 100 },
        { date: "2025-01-02", close: 101 },
        { date: "2025-01-03", close: 102 },
        { date: "2025-01-06", close: 103 },
      ],
    });

    await expect(runStrategyLabV1({
      assets: [
        { assetKey: "HK::0700", symbol: "0700", market: "HK", currency: "HKD", yfinanceSymbol: "0700.HK", currentTargetWeightPct: 100, currentWeightPct: 100 },
      ],
      startDate: "2025-01-01",
      endDate: "2025-01-06",
      benchmarkSymbol: "SPY",
      alignmentMode: "intersection",
      minBars: 2,
      lookbackBars: 2,
      initialEquity: 10000,
    }, { marketDataClient })).rejects.toThrow(/历史 FX 日线缺失/);
  });

  it("writes selected candidate weights back to asset universe and clears legacy config weights", async () => {
    await upsertDaaAssetUniverseRowV1({ symbol: "AAPL", market: "US", watchEnabled: true, targetWeightHint: 0.5, lastPrice: 100 });
    await upsertDaaAssetUniverseRowV1({ symbol: "MSFT", market: "US", watchEnabled: true, targetWeightHint: 0.5, lastPrice: 100 });

    const current = await getDaaSystemConfigV2();
    await saveDaaSystemConfigV2({
      baseVersion: current.version,
      config: {
        ...current.config,
        strategy: {
          ...current.config.strategy,
          targetWeights: {
            "US::AAPL": 0.6,
            "US::MSFT": 0.4,
          },
        },
      },
    });

    const result = await writeStrategyLabTargetWeightsV1({
      candidateId: "ensemble",
      scopeAssetKeys: ["US::AAPL", "US::MSFT"],
      weightsByAssetKey: {
        "US::AAPL": 0.3,
        "US::MSFT": 0.7,
      },
    });

    const rows = await listDaaAssetUniverseV1();
    const byKey = new Map(rows.map((row) => [row.assetKey, row]));
    const next = await getDaaSystemConfigV2();

    expect(result.updatedCount).toBe(2);
    expect(byKey.get("US::AAPL")?.targetWeightHint).toBeCloseTo(0.3, 6);
    expect(byKey.get("US::MSFT")?.targetWeightHint).toBeCloseTo(0.7, 6);
    expect(next.config.strategy.targetWeights).toEqual({});
  });
});
