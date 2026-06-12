/**
 * Context Engine — 单元测试
 */

import { describe, it, expect } from "vitest";
import { ContextManager, estimateTokens, createInvestigateContextManager } from "@/src/daa/agent/context/contextEngine";

describe("estimateTokens", () => {
  it("空字符串返回 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("英文文本约 0.5 倍字符数", () => {
    const tokens = estimateTokens("hello world test");
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  it("中文文本约 0.5 倍字符数", () => {
    const tokens = estimateTokens("你好世界测试文本");
    expect(tokens).toBe(4); // 8 * 0.5 = 4
  });
});

describe("ContextManager", () => {
  it("所有层在预算内时完整保留", () => {
    const cm = new ContextManager();
    cm.addLayer("system", "你是研究分析师");
    cm.addLayer("thesis", "AAPL 看多");
    cm.addLayer("rules", "输出 JSON");

    const result = cm.build(5000);
    expect(result.prompt).toContain("你是研究分析师");
    expect(result.prompt).toContain("AAPL 看多");
    expect(result.prompt).toContain("输出 JSON");
    expect(result.compressedLayers).toHaveLength(0);
  });

  it("超预算时低优先级层被截断", () => {
    const cm = new ContextManager();
    cm.addLayer("system", "A".repeat(100), { priority: 10 });
    cm.addLayer("thesis", "B".repeat(100), { priority: 9 });
    cm.addLayer("memory", "C".repeat(5000), { priority: 5 }); // 大文本
    cm.addLayer("trade_feedback", "D".repeat(3000), { priority: 4 }); // 大文本

    // 给一个很小的预算，迫使低优先级层被压缩
    const result = cm.build(500);

    // 高优先级层应完整保留
    expect(result.prompt).toContain("A".repeat(100));
    expect(result.prompt).toContain("B".repeat(100));

    // 低优先级层应被截断
    expect(result.compressedLayers.length).toBeGreaterThan(0);
  });

  it("memory 层使用 <memory-context> 标签包装", () => {
    const cm = new ContextManager();
    cm.addLayer("system", "sys");
    cm.addLayer("memory", "历史记忆内容", { wrapTag: "memory-context" });

    const result = cm.build(5000);
    expect(result.prompt).toContain("<memory-context>");
    expect(result.prompt).toContain("历史记忆内容");
    expect(result.prompt).toContain("</memory-context>");
  });

  it("strategy 层使用 <strategy-context> 标签包装", () => {
    const cm = new ContextManager();
    cm.addLayer("strategy", "当 VIX > 25 时优先防御", { wrapTag: "strategy-context" });

    const result = cm.build(5000);
    expect(result.prompt).toContain("<strategy-context>");
    expect(result.prompt).toContain("</strategy-context>");
  });

  it("空内容层不输出", () => {
    const cm = new ContextManager();
    cm.addLayer("system", "sys");
    cm.addLayer("memory", "");
    cm.addLayer("strategy", "  ");

    const result = cm.build(5000);
    expect(result.prompt).not.toContain("<memory-context>");
    expect(result.prompt).not.toContain("<strategy-context>");
  });

  // ── 滑动窗口 ──

  it("工具结果滑动窗口：最近 2 轮完整，更早轮压缩", () => {
    const cm = new ContextManager();
    cm.addLayer("system", "sys");
    cm.addToolResultRound("第1轮: AAPL 技术信号 scorePct=75");
    cm.addToolResultRound("第2轮: AAPL 估值信号 temperature=neutral");
    cm.addToolResultRound("第3轮: AAPL 新闻信号 bullish");

    const result = cm.build(10000);
    // 第 1 轮应被压缩
    expect(result.prompt).toContain("已压缩");
    // 第 2、3 轮应完整
    expect(result.prompt).toContain("第2轮: AAPL 估值信号");
    expect(result.prompt).toContain("第3轮: AAPL 新闻信号");
  });

  it("只有 1 轮结果时完整保留", () => {
    const cm = new ContextManager();
    cm.addLayer("system", "sys");
    cm.addToolResultRound("唯一一轮结果");

    const result = cm.build(10000);
    expect(result.prompt).toContain("唯一一轮结果");
    expect(result.prompt).not.toContain("已压缩");
  });

  // ── 预算报告 ──

  it("返回正确的预算报告", () => {
    const cm = new ContextManager();
    cm.addLayer("system", "short");
    cm.addLayer("thesis", "medium text here");

    const result = cm.build(5000);
    expect(result.budgets.length).toBeGreaterThan(0);
    for (const b of result.budgets) {
      expect(b.layerName).toBeTruthy();
      expect(b.actualTokens).toBeGreaterThanOrEqual(0);
    }
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});

describe("createInvestigateContextManager", () => {
  it("创建预配置的 ContextManager", () => {
    const cm = createInvestigateContextManager({
      system: "你是研究分析师",
      thesis: "AAPL 看多判断",
      portfolio: "AAPL: 权重10%",
      memory: "历史记忆",
      tools: "工具列表",
      rules: "输出 JSON",
    });

    const result = cm.build(10000);
    expect(result.prompt).toContain("你是研究分析师");
    expect(result.prompt).toContain("AAPL 看多判断");
    expect(result.prompt).toContain("<memory-context>");
    expect(result.prompt).toContain("历史记忆");
    expect(result.prompt).toContain("</memory-context>");
  });

  it("可选的 tradeFeedback 和 strategy", () => {
    const cm = createInvestigateContextManager({
      system: "sys",
      thesis: "thesis",
      portfolio: "port",
      memory: "mem",
      tools: "tools",
      rules: "rules",
      tradeFeedback: "交易反馈",
      strategy: "策略提示",
    });

    const result = cm.build(10000);
    expect(result.prompt).toContain("交易反馈");
    expect(result.prompt).toContain("<strategy-context>");
    expect(result.prompt).toContain("策略提示");
  });
});
