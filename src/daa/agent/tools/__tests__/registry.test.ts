/**
 * Tool Registry V2 — 单元测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  _clearRegistryForTest,
  registerTool,
  getRegisteredTools,
  getRegisteredToolCount,
  getToolsByCategory,
  getToolByName,
  resolveToolResultVariables,
  formatToolDefinitionsV2ForPrompt,
  executeToolCallV2,
} from "@/src/daa/agent/tools/registry";
import type { ToolResultV2, ToolExecutionContext } from "@/src/daa/agent/tools/types";

// ── 测试用 mock ctx ──
const mockCtx: ToolExecutionContext = { market: null, portfolio: null };

describe("Tool Registry V2", () => {
  beforeEach(() => {
    _clearRegistryForTest();
  });

  // ── 注册 ──

  it("注册单个工具", () => {
    registerTool(
      { name: "test_tool", description: "测试工具", category: "observe", parameters: {} },
      async () => ({ toolName: "test_tool", category: "observe", success: true, data: {}, outputFields: {}, latencyMs: 0 }),
    );
    expect(getRegisteredToolCount()).toBe(1);
    expect(getToolByName("test_tool")).toBeTruthy();
  });

  it("按 category 过滤", () => {
    registerTool(
      { name: "obs_1", description: "观察1", category: "observe", parameters: {} },
      async () => ({ toolName: "obs_1", category: "observe", success: true, data: {}, outputFields: {}, latencyMs: 0 }),
    );
    registerTool(
      { name: "ana_1", description: "分析1", category: "analyze", parameters: {} },
      async () => ({ toolName: "ana_1", category: "analyze", success: true, data: {}, outputFields: {}, latencyMs: 0 }),
    );
    registerTool(
      { name: "act_1", description: "行动1", category: "act", parameters: {}, requiresApproval: true },
      async () => ({ toolName: "act_1", category: "act", success: true, data: {}, outputFields: {}, latencyMs: 0 }),
    );

    expect(getToolsByCategory("observe")).toHaveLength(1);
    expect(getToolsByCategory("analyze")).toHaveLength(1);
    expect(getToolsByCategory("act")).toHaveLength(1);
    expect(getToolsByCategory("meta")).toHaveLength(0);
  });

  // ── 变量替换 ──

  it("替换 $tool_results 变量", () => {
    const allResults = new Map<string, ToolResultV2>();
    allResults.set("fetch_technical_signal", {
      toolName: "fetch_technical_signal",
      category: "observe",
      success: true,
      data: {},
      outputFields: { scorePct: 75, momentumRegime: "bullish", symbol: "AAPL" },
      latencyMs: 100,
    });

    const resolved = resolveToolResultVariables(
      {
        symbol: "$tool_results.fetch_technical_signal.symbol",
        score: "$tool_results.fetch_technical_signal.scorePct",
        plain: "hello",
      },
      allResults,
    );

    expect(resolved.symbol).toBe("AAPL");
    expect(resolved.score).toBe(75);
    expect(resolved.plain).toBe("hello");
  });

  it("变量引用不存在的工具时保留原值", () => {
    const allResults = new Map<string, ToolResultV2>();
    const resolved = resolveToolResultVariables(
      { x: "$tool_results.nonexistent.field" },
      allResults,
    );
    expect(resolved.x).toBe("$tool_results.nonexistent.field");
  });

  it("支持嵌套字段路径", () => {
    const allResults = new Map<string, ToolResultV2>();
    allResults.set("query_market_regime", {
      toolName: "query_market_regime",
      category: "observe",
      success: true,
      data: {},
      outputFields: { nested: { level1: { level2: "deep_value" } } },
      latencyMs: 10,
    });

    const resolved = resolveToolResultVariables(
      { val: "$tool_results.query_market_regime.nested.level1.level2" },
      allResults,
    );
    expect(resolved.val).toBe("deep_value");
  });

  // ── 执行 ──

  it("执行已注册工具", async () => {
    registerTool(
      { name: "echo", description: "回显", category: "meta", parameters: {} },
      async (params) => ({
        toolName: "echo",
        category: "meta",
        success: true,
        data: { echo: params.msg },
        outputFields: { msg: params.msg },
        latencyMs: 1,
      }),
    );

    const result = await executeToolCallV2("echo", { msg: "hello" }, mockCtx);
    expect(result.success).toBe(true);
    expect(result.outputFields.msg).toBe("hello");
  });

  it("执行未注册工具返回错误", async () => {
    const result = await executeToolCallV2("nonexistent", {}, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("未知工具");
  });

  it("执行器抛异常时优雅降级", async () => {
    registerTool(
      { name: "crasher", description: "崩溃", category: "observe", parameters: {} },
      async () => { throw new Error("boom"); },
    );

    const result = await executeToolCallV2("crasher", {}, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });

  // ── Prompt 格式化 ──

  it("按 category 分组格式化", () => {
    registerTool(
      { name: "obs", description: "观察", category: "observe", parameters: { sym: { type: "string", description: "代码", required: true } }, outputSchema: { score: "number" } },
      async () => ({ toolName: "obs", category: "observe", success: true, data: {}, outputFields: {}, latencyMs: 0 }),
    );
    registerTool(
      { name: "act", description: "行动", category: "act", parameters: {}, requiresApproval: true },
      async () => ({ toolName: "act", category: "act", success: true, data: {}, outputFields: {}, latencyMs: 0 }),
    );

    const text = formatToolDefinitionsV2ForPrompt();
    expect(text).toContain("观察类");
    expect(text).toContain("行动类");
    expect(text).toContain("$tool_results.obs.");
    expect(text).toContain("需要确认");
  });
});

// ── 全量注册测试（import index.ts）──

describe("全量工具注册", () => {
  beforeEach(() => {
    _clearRegistryForTest();
  });

  it("导入 index.ts 后注册 14 个工具", async () => {
    // 动态导入触发自注册
    await import("@/src/daa/agent/tools/index");
    expect(getRegisteredToolCount()).toBe(14);

    // 验证各 category 数量
    expect(getToolsByCategory("observe")).toHaveLength(6);
    expect(getToolsByCategory("analyze")).toHaveLength(3);
    expect(getToolsByCategory("meta")).toHaveLength(3);
    expect(getToolsByCategory("act")).toHaveLength(2);
  });

  it("act 类工具都标记 requiresApproval", async () => {
    await import("@/src/daa/agent/tools/index");
    const actTools = getToolsByCategory("act");
    for (const t of actTools) {
      expect(t.definition.requiresApproval).toBe(true);
    }
  });

  it("所有工具都有 description 和 category", async () => {
    await import("@/src/daa/agent/tools/index");
    const tools = getRegisteredTools();
    for (const t of tools) {
      expect(t.definition.name).toBeTruthy();
      expect(t.definition.description).toBeTruthy();
      expect(["observe", "analyze", "act", "meta"]).toContain(t.definition.category);
    }
  });
});
