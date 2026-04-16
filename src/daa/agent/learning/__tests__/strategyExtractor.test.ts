/**
 * Strategy Extractor — 单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// mock strategyStore 的 DB 依赖
vi.mock("@/src/daa/agent/learning/strategyStore", () => ({
  listStrategies: vi.fn().mockResolvedValue([]),
  createStrategy: vi.fn().mockResolvedValue({ id: "test-1", name: "test" }),
}));

import { extractStrategyFromRun } from "@/src/daa/agent/learning/strategyExtractor";
import { listStrategies, createStrategy } from "@/src/daa/agent/learning/strategyStore";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractStrategyFromRun", () => {
  it("thesesUpdated=0 时不提炼策略", async () => {
    const result = await extractStrategyFromRun({
      runId: "run-1",
      toolsCalled: [
        { tool: "fetch_technical_signal", input: { symbol: "AAPL" }, outputSummary: "ok" },
        { tool: "fetch_valuation_signal", input: { symbol: "AAPL" }, outputSummary: "ok" },
      ],
      thesesUpdated: 0,
      surprises: 0,
      regime: "risk_on",
      targetConvictions: ["high"],
    });

    expect(result.created).toBe(false);
    expect(createStrategy).not.toHaveBeenCalled();
  });

  it("工具数 < 2 时不提炼策略", async () => {
    const result = await extractStrategyFromRun({
      runId: "run-2",
      toolsCalled: [
        { tool: "fetch_technical_signal", input: { symbol: "AAPL" }, outputSummary: "ok" },
      ],
      thesesUpdated: 1,
      surprises: 0,
      regime: "risk_off",
      targetConvictions: ["uncertain"],
    });

    expect(result.created).toBe(false);
  });

  it("满足条件时成功提炼策略", async () => {
    const result = await extractStrategyFromRun({
      runId: "run-3",
      toolsCalled: [
        { tool: "fetch_technical_signal", input: { symbol: "AAPL" }, outputSummary: "ok" },
        { tool: "fetch_valuation_signal", input: { symbol: "AAPL" }, outputSummary: "ok" },
        { tool: "backtest_thesis", input: { symbol: "AAPL" }, outputSummary: "ok" },
      ],
      thesesUpdated: 2,
      surprises: 1,
      regime: "risk_off",
      targetConvictions: ["uncertain"],
    });

    expect(result.created).toBe(true);
    expect(result.strategyName).toBeTruthy();
    expect(createStrategy).toHaveBeenCalledOnce();

    // 验证 createStrategy 参数
    const call = (createStrategy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.triggerConditions).toContain("risk_off");
    expect(call.triggerConditions).toContain("uncertain");
    expect(call.toolSequence.length).toBe(3);
    expect(call.sourceRunIds).toContain("run-3");
  });

  it("已存在相同工具组合时不重复创建", async () => {
    // mock 返回一个已有策略，工具组合相同
    (listStrategies as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "existing-1",
        name: "existing",
        toolSequence: ["backtest_thesis", "fetch_technical_signal", "fetch_valuation_signal"],
        triggerConditions: "risk_off",
        successRate: 0.8,
        usageCount: 5,
      },
    ]);

    const result = await extractStrategyFromRun({
      runId: "run-4",
      toolsCalled: [
        { tool: "fetch_technical_signal", input: {}, outputSummary: "ok" },
        { tool: "fetch_valuation_signal", input: {}, outputSummary: "ok" },
        { tool: "backtest_thesis", input: {}, outputSummary: "ok" },
      ],
      thesesUpdated: 1,
      surprises: 0,
      regime: "risk_off",
      targetConvictions: ["high"],
    });

    expect(result.created).toBe(false);
    expect(createStrategy).not.toHaveBeenCalled();
  });

  it("空 toolsCalled 时不提炼", async () => {
    const result = await extractStrategyFromRun({
      runId: "run-5",
      toolsCalled: [],
      thesesUpdated: 1,
      surprises: 0,
      regime: "risk_on",
      targetConvictions: [],
    });

    expect(result.created).toBe(false);
  });
});
