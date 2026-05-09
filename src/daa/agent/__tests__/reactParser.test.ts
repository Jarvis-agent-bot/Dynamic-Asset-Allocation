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

  it("拒绝无 action 包装的旧 InvestigateOutput", () => {
    expect(parseReactResponse({
      thesisChanged: false,
      evidenceType: "neutral",
      evidenceSummary: "旧结构不再接受。",
    })).toBeNull();
  });
});
