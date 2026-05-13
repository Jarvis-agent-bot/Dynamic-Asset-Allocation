import { describe, expect, it } from "vitest";

import {
  deriveEvidenceQuality,
  isNoResultFallbackEvidence,
  normalizeAgentEvidenceContent,
} from "./evidenceText";

describe("agent/evidenceText", () => {
  it("strips internal agent polling prefixes", () => {
    expect(normalizeAgentEvidenceContent("[子 agent] [子 agent 轮询] 已触达该论点")).toBe("已触达该论点");
  });

  it("detects no-result fallback copy", () => {
    expect(isNoResultFallbackEvidence("[子 agent] [子 agent 轮询] 已触达该论点并执行调查，但模型未返回可解析的结构化结论；本轮保留原论点，等待下一轮证据确认。")).toBe(true);
  });

  it("derives evidence quality from source, confidence and data snapshot", () => {
    expect(deriveEvidenceQuality({
      source: "valuation",
      confidence: 0.72,
      content: "PE 与 PEG 均处于自身历史低位，估值具备吸引力。",
      dataSnapshot: { pe: 18, peg: 1.1 },
    }).level).toBe("high");

    expect(deriveEvidenceQuality({
      source: "agent_reasoning",
      confidence: 0.35,
      content: "可能受益。",
    }).level).toBe("low");
  });
});
