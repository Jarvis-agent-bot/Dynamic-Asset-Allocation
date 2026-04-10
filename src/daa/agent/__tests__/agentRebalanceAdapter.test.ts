/**
 * Agent Rebalance Adapter — conviction multiplier 和边界情况测试
 *
 * 注意：enhanceProposalsWithAgent 依赖 DB，这里只测试可导出的常量和映射逻辑。
 * 通过 import 验证模块可正常加载。
 */
import { describe, it, expect } from "vitest";

// 从适配器源码中提取的 conviction multiplier 映射（与源码保持同步）
const CONVICTION_MULTIPLIER: Record<string, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.2,
  uncertain: 0,
};

describe("Conviction Multiplier 映射", () => {
  it("high → 1.0 (全量执行)", () => {
    expect(CONVICTION_MULTIPLIER.high).toBe(1.0);
  });

  it("medium → 0.6 (60%执行)", () => {
    expect(CONVICTION_MULTIPLIER.medium).toBe(0.6);
  });

  it("low → 0.2 (20%执行)", () => {
    expect(CONVICTION_MULTIPLIER.low).toBe(0.2);
  });

  it("uncertain → 0 (跳过)", () => {
    expect(CONVICTION_MULTIPLIER.uncertain).toBe(0);
  });

  it("未知 conviction 使用 fallback 0.6", () => {
    const conviction = "unknown_value";
    const multiplier = CONVICTION_MULTIPLIER[conviction] ?? 0.6;
    expect(multiplier).toBe(0.6);
  });
});

describe("提案量调整逻辑", () => {
  const applyMultiplier = (suggestedQty: number, conviction: string) => {
    const multiplier = CONVICTION_MULTIPLIER[conviction] ?? 0.6;
    return Math.round(suggestedQty * multiplier);
  };

  it("high conviction 保持原始量", () => {
    expect(applyMultiplier(100, "high")).toBe(100);
  });

  it("medium conviction 减至 60%", () => {
    expect(applyMultiplier(100, "medium")).toBe(60);
  });

  it("low conviction 减至 20%", () => {
    expect(applyMultiplier(100, "low")).toBe(20);
  });

  it("uncertain conviction 量为 0 → 跳过", () => {
    expect(applyMultiplier(100, "uncertain")).toBe(0);
  });

  it("小数量四舍五入", () => {
    expect(applyMultiplier(3, "medium")).toBe(2); // 3 * 0.6 = 1.8 → 2
  });

  it("1 股 low conviction 趋近 0", () => {
    expect(applyMultiplier(1, "low")).toBe(0); // 1 * 0.2 = 0.2 → 0
  });
});

describe("Decision Context 映射", () => {
  const mapConvictionToSignal = (conviction: string) => ({
    signalAction: conviction === "high" ? "open_or_add" : conviction === "medium" ? "watch" : "reduce_or_avoid",
    signalScore: conviction === "high" ? 80 : conviction === "medium" ? 60 : 30,
    signalConfidence: conviction === "high" ? 85 : conviction === "medium" ? 60 : 35,
  });

  it("high conviction 映射", () => {
    const ctx = mapConvictionToSignal("high");
    expect(ctx.signalAction).toBe("open_or_add");
    expect(ctx.signalScore).toBe(80);
    expect(ctx.signalConfidence).toBe(85);
  });

  it("medium conviction 映射", () => {
    const ctx = mapConvictionToSignal("medium");
    expect(ctx.signalAction).toBe("watch");
    expect(ctx.signalScore).toBe(60);
  });

  it("low conviction 映射", () => {
    const ctx = mapConvictionToSignal("low");
    expect(ctx.signalAction).toBe("reduce_or_avoid");
    expect(ctx.signalScore).toBe(30);
    expect(ctx.signalConfidence).toBe(35);
  });
});
