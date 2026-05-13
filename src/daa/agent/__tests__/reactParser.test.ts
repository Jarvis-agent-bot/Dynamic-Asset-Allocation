import { describe, expect, it } from "vitest";

import { parseReactResponse } from "@/src/daa/agent/helpers/reactParser";

describe("parseReactResponse", () => {
  it("解析工具调用 action", () => {
    const parsed = parseReactResponse({
      action: "tool_calls",
      reasoning: "需要先查市场数据",
      tool_calls: [
        { name: "get_market_context", params: { symbol: "NVDA" } },
        { name: "", params: {} },
      ],
    });

    expect(parsed).toEqual({
      action: "tool_calls",
      reasoning: "需要先查市场数据",
      tool_calls: [
        { name: "get_market_context", params: { symbol: "NVDA" } },
      ],
    });
  });

  it("解析最终结论 action", () => {
    const parsed = parseReactResponse({
      action: "result",
      result: {
        thesisChanged: false,
        evidenceType: "neutral",
        evidenceSummary: "证据不足，保持观察。",
      },
    });

    expect(parsed?.action).toBe("result");
    expect(parsed && "result" in parsed ? parsed.result.evidenceSummary : null).toBe("证据不足，保持观察。");
  });

  it("兼容无 action 包装的最终结论", () => {
    const parsed = parseReactResponse({
      thesisChanged: false,
      evidenceType: "neutral",
      evidenceSummary: "模型直接返回了最终结论。",
    });

    expect(parsed?.action).toBe("result");
    expect(parsed && "result" in parsed ? parsed.result.evidenceSummary : null).toBe("模型直接返回了最终结论。");
  });
});
