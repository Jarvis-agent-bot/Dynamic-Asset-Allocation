import { describe, it, expect } from "vitest";
import { computePortfolioRiskMetrics, computeCorrelationMatrix, runStressTests } from "../riskMetrics";

describe("riskMetrics", () => {
  describe("computePortfolioRiskMetrics", () => {
    it("should calculate metrics for a simple portfolio", () => {
      // 创建一个简单的日收益率序列（平均 0.05%，标准差约 1%）
      const dailyReturns = Array(252)
        .fill(0)
        .map(() => (Math.random() - 0.5) * 0.02 + 0.0005);

      const weights = new Map([
        ["AAPL", 0.5],
        ["MSFT", 0.3],
        ["TSLA", 0.2],
      ]);

      const assetReturns = new Map([
        ["AAPL", dailyReturns.map(() => (Math.random() - 0.5) * 0.025 + 0.0006)],
        ["MSFT", dailyReturns.map(() => (Math.random() - 0.5) * 0.02 + 0.0005)],
        ["TSLA", dailyReturns.map(() => (Math.random() - 0.5) * 0.035 + 0.0008)],
      ]);

      const metrics = computePortfolioRiskMetrics({
        dailyReturns,
        riskFreeRate: 0.04,
        weights,
        assetReturns,
      });

      // 验证基本属性存在且合理
      expect(metrics.annualizedVolatility).toBeGreaterThan(0);
      expect(metrics.annualizedVolatility).toBeLessThan(100); // 不应超过 100%
      expect(metrics.dailyVolatility).toBeGreaterThan(0);
      expect(metrics.dailyVolatility).toBeLessThan(5);

      expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(metrics.maxDrawdown).toBeLessThanOrEqual(100);

      expect(metrics.hhi).toBeGreaterThan(0);
      expect(metrics.hhi).toBeLessThanOrEqual(1);

      expect(metrics.top3Concentration).toBeGreaterThan(0);
      expect(metrics.top3Concentration).toBeLessThanOrEqual(100);
    });

    it("should handle edge case of empty returns", () => {
      const metrics = computePortfolioRiskMetrics({
        dailyReturns: [],
        weights: new Map(),
        assetReturns: new Map(),
      });

      expect(metrics.annualizedVolatility).toBe(0);
      expect(metrics.maxDrawdown).toBe(0);
      expect(metrics.hhi).toBe(0);
    });

    it("should handle single asset portfolio", () => {
      const dailyReturns = [0.01, -0.005, 0.008, -0.002, 0.012];
      const weights = new Map([["SPY", 1.0]]);
      const assetReturns = new Map([["SPY", dailyReturns]]);

      const metrics = computePortfolioRiskMetrics({
        dailyReturns,
        weights,
        assetReturns,
      });

      expect(metrics.hhi).toBeGreaterThan(0.99); // 接近 1（高度集中）
      expect(metrics.top3Concentration).toBeGreaterThan(99);
    });
  });

  describe("computeCorrelationMatrix", () => {
    it("should compute correlation matrix for assets", () => {
      const returns = [0.01, -0.005, 0.008, -0.002, 0.012];
      const assetReturns = new Map([
        ["AAPL", returns],
        ["MSFT", returns.map((x) => x * 0.8)], // 高度相关
        ["TSLA", returns.map((x) => -x)], // 负相关
      ]);

      const result = computeCorrelationMatrix(assetReturns);

      expect(result.symbols).toEqual(["AAPL", "MSFT", "TSLA"]);
      expect(result.matrix.length).toBe(3);
      expect(result.matrix[0].length).toBe(3);

      // 对角线应为 1
      expect(result.matrix[0][0]).toBe(1);
      expect(result.matrix[1][1]).toBe(1);
      expect(result.matrix[2][2]).toBe(1);

      // 矩阵应对称
      expect(result.matrix[0][1]).toBe(result.matrix[1][0]);
    });

    it("should return empty matrix for single asset", () => {
      const assetReturns = new Map([["AAPL", [0.01, -0.005]]]);
      const result = computeCorrelationMatrix(assetReturns);

      expect(result.symbols).toEqual(["AAPL"]);
      expect(result.matrix).toEqual([[1]]);
    });
  });

  describe("runStressTests", () => {
    it("should run stress tests and return results", () => {
      const weights = new Map([
        ["AAPL", 0.4],
        ["TLT", 0.3],
        ["GLD", 0.2],
        ["BTC", 0.1],
      ]);

      const assetClasses = new Map([
        ["AAPL", "EQUITY"],
        ["TLT", "BOND"],
        ["GLD", "COMMODITY"],
        ["BTC", "CRYPTO"],
      ]);

      const results = runStressTests({
        weights,
        assetClasses,
        totalEquity: 100000,
      });

      // 应该返回 5 个场景
      expect(results.length).toBe(5);

      // 每个结果应该包含必要字段
      for (const result of results) {
        expect(result.scenario).toBeDefined();
        expect(result.scenarioZh).toBeDefined();
        expect(result.description).toBeDefined();
        expect(result.estimatedLoss).toBeDefined();
        expect(result.estimatedLossAmount).toBeDefined();
        expect(result.affectedAssets).toBeDefined();
        expect(Array.isArray(result.affectedAssets)).toBe(true);
      }

      // 2008 年金融危机场景应该导致负收益
      const crisis2008 = results.find((r) => r.scenario === "2008_financial_crisis");
      expect(crisis2008).toBeDefined();
      expect(crisis2008!.estimatedLoss).toBeLessThan(0);
    });

    it("should handle empty portfolio", () => {
      const results = runStressTests({
        weights: new Map(),
        assetClasses: new Map(),
        totalEquity: 0,
      });

      expect(results.length).toBe(5);
      for (const result of results) {
        expect(result.estimatedLoss).toBe(0);
        expect(result.estimatedLossAmount).toBe(0);
      }
    });
  });

  describe("edge cases and validations", () => {
    it("should handle negative daily returns correctly", () => {
      const dailyReturns = [-0.05, -0.03, -0.02, 0.01, 0.02];
      const weights = new Map([["SPY", 1.0]]);
      const assetReturns = new Map([["SPY", dailyReturns]]);

      const metrics = computePortfolioRiskMetrics({
        dailyReturns,
        weights,
        assetReturns,
      });

      expect(metrics.maxDrawdown).toBeGreaterThan(0);
      expect(metrics.annualizedVolatility).toBeGreaterThan(0);
    });

    it("should handle very small portfolio values", () => {
      const weights = new Map([
        ["AAPL", 0.5],
        ["MSFT", 0.5],
      ]);

      const assetClasses = new Map([
        ["AAPL", "EQUITY"],
        ["MSFT", "EQUITY"],
      ]);

      const results = runStressTests({
        weights,
        assetClasses,
        totalEquity: 0.01, // 极小的总权益
      });

      expect(results.length).toBe(5);
      expect(results[0].estimatedLossAmount).toBeLessThan(1); // 损失应该很小
    });

    it("should calculate Sharpe ratio correctly with sufficient data", () => {
      // 创建一个日均收益为 0.0005（年化约 12.6%）、波动率为 1% 的序列
      const returns: number[] = [];
      for (let i = 0; i < 252; i++) {
        returns.push(0.0005 + (Math.random() - 0.5) * 0.01);
      }

      const weights = new Map([["SPY", 1.0]]);
      const assetReturns = new Map([["SPY", returns]]);

      const metrics = computePortfolioRiskMetrics({
        dailyReturns: returns,
        riskFreeRate: 0.04,
        weights,
        assetReturns,
      });

      // Sharpe 应该是正数（如果收益高于无风险率）
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
    });
  });
});
