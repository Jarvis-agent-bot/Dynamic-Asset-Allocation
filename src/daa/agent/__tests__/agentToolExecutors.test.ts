/**
 * Agent Tool Executors — 单元测试
 *
 * 测试 executor 注册表构建、工具调用路由、超时处理、state-dependent 工具。
 */
import { describe, it, expect } from "vitest";
import { buildExecutorRegistry, executeToolCall } from "@/src/daa/agent/agentToolExecutors";
import type { PortfolioSnapshot, MarketSnapshot } from "@/src/daa/agent/cognitiveState";

// ── 测试数据 ──

// weightPct 使用小数形式（0.0-1.0），与 observeNode 一致
const mockPortfolio: PortfolioSnapshot = {
  holdings: [
    { assetKey: "US:AAPL", symbol: "AAPL", holdingQty: 100, lastPrice: 180, weightPct: 0.30, unrealizedPnlPct: 0.15 },
    { assetKey: "US:NVDA", symbol: "NVDA", holdingQty: 50, lastPrice: 800, weightPct: 0.40, unrealizedPnlPct: 0.25 },
    { assetKey: "US:GLD", symbol: "GLD", holdingQty: 200, lastPrice: 200, weightPct: 0.20, unrealizedPnlPct: -0.02 },
    { assetKey: "US:CASH", symbol: "CASH", holdingQty: 1, lastPrice: 10000, weightPct: 0.10, unrealizedPnlPct: 0 },
  ],
  totalEquity: 100000,
  cashPct: 0.10,
};

const mockMarket: MarketSnapshot = {
  regime: "risk_on",
  vix: 18.5,
  indicators: { qqqSpyRatio: 1.12, goldSilverRatio: 78 },
};

// ── buildExecutorRegistry ──

describe("buildExecutorRegistry", () => {
  it("返回 6 个 executor", () => {
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: mockPortfolio });
    expect(Object.keys(registry)).toHaveLength(6);
    expect(registry.fetch_technical_signal).toBeDefined();
    expect(registry.fetch_valuation_signal).toBeDefined();
    expect(registry.fetch_news_signal).toBeDefined();
    expect(registry.fetch_human_signal).toBeDefined();
    expect(registry.query_market_regime).toBeDefined();
    expect(registry.query_portfolio_concentration).toBeDefined();
  });

  it("null state 也能构建", () => {
    const registry = buildExecutorRegistry({ market: null, portfolio: null });
    expect(Object.keys(registry)).toHaveLength(6);
  });
});

// ── executeToolCall ──

describe("executeToolCall", () => {
  it("未知工具返回 error", async () => {
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: mockPortfolio });
    const result = await executeToolCall(registry, "unknown_tool", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("未知工具");
  });
});

// ── query_market_regime ──

describe("query_market_regime executor", () => {
  it("正常返回市场环境", async () => {
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: mockPortfolio });
    const result = await executeToolCall(registry, "query_market_regime", {});
    expect(result.success).toBe(true);
    expect(result.toolName).toBe("query_market_regime");
    const data = result.data as Record<string, unknown>;
    expect(data.regime).toBe("risk_on");
    expect(data.vix).toBe(18.5);
  });

  it("市场数据为 null 时返回 error", async () => {
    const registry = buildExecutorRegistry({ market: null, portfolio: mockPortfolio });
    const result = await executeToolCall(registry, "query_market_regime", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("未加载");
  });
});

// ── query_portfolio_concentration ──

describe("query_portfolio_concentration executor", () => {
  it("正常计算 HHI 和集中度", async () => {
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: mockPortfolio });
    const result = await executeToolCall(registry, "query_portfolio_concentration", {});
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.holdingsCount).toBe(4);
    expect(data.maxPositionWeightPct).toBeCloseTo(0.40, 2);
    expect(data.cashPct).toBeCloseTo(0.10, 2);
    expect(typeof data.hhi).toBe("number");
    expect(typeof data.hhiLabel).toBe("string");
    // HHI = (0.30² + 0.40² + 0.20² + 0.10²) = 0.09 + 0.16 + 0.04 + 0.01 = 0.30
    expect(data.hhi).toBeCloseTo(0.30, 2);
    expect(data.hhiLabel).toBe("高度集中");
    expect(Array.isArray(data.topHoldings)).toBe(true);
  });

  it("组合为 null 时返回 error", async () => {
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: null });
    const result = await executeToolCall(registry, "query_portfolio_concentration", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("未加载");
  });

  it("空持仓返回 error", async () => {
    const emptyPortfolio: PortfolioSnapshot = { holdings: [], totalEquity: 0, cashPct: 100 };
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: emptyPortfolio });
    const result = await executeToolCall(registry, "query_portfolio_concentration", {});
    expect(result.success).toBe(false);
  });
});

// ── 静态 executor 参数校验 ──

describe("静态 executor 参数校验", () => {
  it("fetch_technical_signal 缺少 symbol 返回 error", async () => {
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: mockPortfolio });
    const result = await executeToolCall(registry, "fetch_technical_signal", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("symbol");
  });

  it("fetch_valuation_signal 缺少 symbol 返回 error", async () => {
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: mockPortfolio });
    const result = await executeToolCall(registry, "fetch_valuation_signal", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("symbol");
  });

  it("fetch_news_signal 缺少 symbol 返回 error", async () => {
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: mockPortfolio });
    const result = await executeToolCall(registry, "fetch_news_signal", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("symbol");
  });

  it("fetch_human_signal 缺少 symbol 返回 error", async () => {
    const registry = buildExecutorRegistry({ market: mockMarket, portfolio: mockPortfolio });
    const result = await executeToolCall(registry, "fetch_human_signal", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("symbol");
  });
});
