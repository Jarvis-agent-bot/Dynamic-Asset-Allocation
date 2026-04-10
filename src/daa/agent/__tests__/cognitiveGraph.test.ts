/**
 * Cognitive Graph — 纯逻辑单元测试
 *
 * 测试 validateShape、estimateTokens、成本常量等不依赖 DB 的纯函数。
 */
import { describe, it, expect } from "vitest";
import { validateShape, estimateTokens, DEEPSEEK_AVG_COST_PER_TOKEN } from "@/src/daa/agent/cognitiveGraph";

// ── validateShape ──

describe("validateShape", () => {
  it("空 schema 通过任何对象", () => {
    expect(validateShape({}, {})).toEqual([]);
    expect(validateShape({ foo: 1 }, {})).toEqual([]);
  });

  it("检测缺少必填字段", () => {
    const errors = validateShape({}, { targets: "array" });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("targets");
  });

  it("检测类型不匹配 — 期望 array 得到 string", () => {
    const errors = validateShape({ targets: "not-array" }, { targets: "array" });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("array");
  });

  it("检测类型不匹配 — 期望 boolean 得到 string", () => {
    const errors = validateShape({ thesisChanged: "yes" }, { thesisChanged: "boolean" });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("boolean");
  });

  it("检测类型不匹配 — 期望 number 得到 string", () => {
    const errors = validateShape({ score: "0.7" }, { score: "number" });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("number");
  });

  it("通过 — array 字段正确", () => {
    expect(validateShape({ targets: [] }, { targets: "array" })).toEqual([]);
    expect(validateShape({ targets: [1, 2] }, { targets: "array" })).toEqual([]);
  });

  it("通过 — 多字段正确", () => {
    const data = { thesisChanged: true, evidenceType: "supporting", evidenceSummary: "test" };
    const schema = { thesisChanged: "boolean" as const, evidenceType: "string" as const, evidenceSummary: "string" as const };
    expect(validateShape(data, schema)).toEqual([]);
  });

  it("null 输入返回错误", () => {
    expect(validateShape(null, { a: "string" })).toEqual(["data is null or not an object"]);
  });

  it("多个错误同时返回", () => {
    const errors = validateShape({}, { a: "string", b: "number", c: "array" });
    expect(errors.length).toBe(3);
  });

  it("object 类型校验正确", () => {
    expect(validateShape({ x: {} }, { x: "object" })).toEqual([]);
    expect(validateShape({ x: [] }, { x: "object" }).length).toBe(1); // array 不是 object
  });
});

// ── estimateTokens ──

describe("estimateTokens", () => {
  it("空字符串返回 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("短文本返回合理估计", () => {
    const tokens = estimateTokens("hello world");
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  it("中文文本返回合理估计", () => {
    const tokens = estimateTokens("你好世界这是测试");
    expect(tokens).toBeGreaterThan(0);
  });

  it("返回整数", () => {
    const tokens = estimateTokens("abc");
    expect(Number.isInteger(tokens)).toBe(true);
  });
});

// ── 成本常量 ──

describe("DEEPSEEK_AVG_COST_PER_TOKEN", () => {
  it("在合理范围内 ($0.1/M ~ $0.5/M)", () => {
    const costPerMillion = DEEPSEEK_AVG_COST_PER_TOKEN * 1_000_000;
    expect(costPerMillion).toBeGreaterThan(0.1);
    expect(costPerMillion).toBeLessThan(0.5);
  });

  it("1000 tokens 成本约 $0.0002", () => {
    const cost = 1000 * DEEPSEEK_AVG_COST_PER_TOKEN;
    expect(cost).toBeCloseTo(0.00021, 5);
  });
});
