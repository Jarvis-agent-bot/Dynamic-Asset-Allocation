/**
 * Agent Tool Registry — 单元测试
 *
 * 测试动态注册表的工具调用路由、state-dependent 工具、参数校验。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { executeToolCallV2, clearToolResultCache } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext } from "@/src/daa/agent/tools/types";
import type { PortfolioSnapshot, MarketSnapshot } from "@/src/daa/agent/cognitiveState";

// 触发所有工具自注册
import "@/src/daa/agent/tools/index";

// 每个测试前清空缓存，避免跨测试缓存命中
beforeEach(() => {
  clearToolResultCache();
});

// ── 测试数据 ──

const mockPortfolio: PortfolioSnapshot = {
  holdings: [
    { assetKey: "US::AAPL", symbol: "AAPL", holdingQty: 100, lastPrice: 180, weightPct: 0.30, unrealizedPnlPct: 0.15 },
    { assetKey: "US::NVDA", symbol: "NVDA", holdingQty: 50, lastPrice: 800, weightPct: 0.40, unrealizedPnlPct: 0.25 },
    { assetKey: "US::GLD", symbol: "GLD", holdingQty: 200, lastPrice: 200, weightPct: 0.20, unrealizedPnlPct: -0.02 },
    { assetKey: "US::CASH", symbol: "CASH", holdingQty: 1, lastPrice: 10000, weightPct: 0.10, unrealizedPnlPct: 0 },
  ],
  totalEquity: 100000,
  cashPct: 0.10,
};

const mockMarket: MarketSnapshot = {
  regime: "risk_on",
  vix: 18.5,
  indicators: { qqqSpyRatio: 1.12, goldSilverRatio: 78 },
  sessions: [
    {
      market: "US",
      isOpen: true,
      reasonCode: "OPEN",
      localDate: "2026-06-08",
      localTime: "10:00",
      reasonZh: "US 当前处于常规交易时段（2026-06-08 10:00）。",
    },
  ],
};

const mockCtx: ToolExecutionContext = { market: mockMarket, portfolio: mockPortfolio };

// ── executeToolCallV2 ──

describe("executeToolCallV2", () => {
  it("未知工具返回 error", async () => {
    const result = await executeToolCallV2("unknown_tool", {}, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("未知工具");
  });
});

// ── query_market_regime ──

describe("query_market_regime V2", () => {
  it("正常返回市场环境", async () => {
    const result = await executeToolCallV2("query_market_regime", {}, mockCtx);
    expect(result.success).toBe(true);
    expect(result.toolName).toBe("query_market_regime");
    expect(result.category).toBe("observe");
    const data = result.data as Record<string, unknown>;
    expect(data.regime).toBe("risk_on");
    expect(data.vix).toBe(18.5);
    expect(data.sessions).toEqual(mockMarket.sessions);
    // V2: outputFields 供链式引用
    expect(result.outputFields.regime).toBe("risk_on");
    expect(result.outputFields.vix).toBe(18.5);
    expect(result.outputFields.openMarkets).toEqual(["US"]);
  });

  it("市场数据为 null 时返回 error", async () => {
    const result = await executeToolCallV2("query_market_regime", {}, { market: null, portfolio: mockPortfolio });
    expect(result.success).toBe(false);
    expect(result.error).toContain("未加载");
  });
});

// ── query_portfolio_concentration ──

describe("query_portfolio_concentration V2", () => {
  it("正常计算 HHI 和集中度", async () => {
    const result = await executeToolCallV2("query_portfolio_concentration", {}, mockCtx);
    expect(result.success).toBe(true);
    expect(result.category).toBe("observe");
    const data = result.data as Record<string, unknown>;
    expect(data.holdingsCount).toBe(4);
    expect(data.maxPositionWeightPct).toBeCloseTo(0.40, 2);
    expect(data.cashPct).toBeCloseTo(0.10, 2);
    expect(typeof data.hhi).toBe("number");
    expect(typeof data.hhiLabel).toBe("string");
    expect(data.hhi).toBeCloseTo(0.30, 2);
    expect(data.hhiLabel).toBe("高度集中");
    // V2: outputFields
    expect(result.outputFields.hhi).toBeCloseTo(0.30, 2);
    expect(result.outputFields.holdingsCount).toBe(4);
  });

  it("组合为 null 时返回 error", async () => {
    const result = await executeToolCallV2("query_portfolio_concentration", {}, { market: mockMarket, portfolio: null });
    expect(result.success).toBe(false);
    expect(result.error).toContain("未加载");
  });

  it("空持仓返回 error", async () => {
    const emptyPortfolio: PortfolioSnapshot = { holdings: [], totalEquity: 0, cashPct: 100 };
    const result = await executeToolCallV2("query_portfolio_concentration", {}, { market: mockMarket, portfolio: emptyPortfolio });
    expect(result.success).toBe(false);
  });
});

// ── 静态 executor 参数校验 ──

describe("V2 参数校验", () => {
  it("fetch_technical_signal 缺少 symbol 返回 error", async () => {
    const result = await executeToolCallV2("fetch_technical_signal", {}, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("symbol");
  });

  it("fetch_valuation_signal 缺少 symbol 返回 error", async () => {
    const result = await executeToolCallV2("fetch_valuation_signal", {}, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("symbol");
  });

  it("fetch_news_signal 缺少 symbol 返回 error", async () => {
    const result = await executeToolCallV2("fetch_news_signal", {}, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("symbol");
  });

  it("fetch_human_signal 缺少 symbol 返回 error", async () => {
    const result = await executeToolCallV2("fetch_human_signal", {}, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("symbol");
  });
});
