import { describe, expect, it } from "vitest";

import {
  deriveReviewBasisQuality,
  isNoResultFallbackReviewBasis,
  normalizeInvestmentReviewBasisContent,
} from "./evidenceText";

describe("agent/evidenceText", () => {
  it("strips internal review prefixes", () => {
    expect(normalizeInvestmentReviewBasisContent("[子 agent] [子 agent 轮询] 已触达该判断")).toBe("已触达该判断");
    expect(normalizeInvestmentReviewBasisContent("[后台复核] 已触达该判断")).toBe("已触达该判断");
  });

  it("detects no-result fallback copy", () => {
    expect(isNoResultFallbackReviewBasis("[子 agent] [子 agent 轮询] 已触达该投资判断并执行复核，但模型未返回可解析的结构化结论；本轮保留原判断，等待下一轮依据确认。")).toBe(true);
    expect(isNoResultFallbackReviewBasis("[后台复核] 已触达该判断并执行复核，但模型未返回可解析的结构化结论；本轮保留原判断，等待下一轮证据确认。")).toBe(true);
  });

  it("derives review basis quality from source, confidence and data snapshot", () => {
    expect(deriveReviewBasisQuality({
      source: "valuation",
      confidence: 0.72,
      content: "PE 与 PEG 均处于自身历史低位，估值具备吸引力。",
      dataSnapshot: { pe: 18, peg: 1.1 },
    }).level).toBe("high");

    expect(deriveReviewBasisQuality({
      source: "agent_reasoning",
      confidence: 0.35,
      content: "可能受益。",
    }).level).toBe("low");
  });
});
