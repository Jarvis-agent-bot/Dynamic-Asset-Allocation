import { describe, expect, it } from "vitest";

import { parseAssistantIntent } from "@/src/daa/chat/intentParser";

describe("assistant-intent-parser", () => {
  it("识别买入指令和股数", () => {
    const intent = parseAssistantIntent("买入 QQQ 10股");
    expect(intent).toMatchObject({
      kind: "trade",
      side: "BUY",
      symbol: "QQQ",
      qty: 10,
      notional: null,
    });
  });

  it("识别卖出指令和名义金额", () => {
    const intent = parseAssistantIntent("卖出 AAPL 500美元");
    expect(intent).toMatchObject({
      kind: "trade",
      side: "SELL",
      symbol: "AAPL",
      qty: null,
      notional: 500,
    });
  });

  it("识别生成调仓建议", () => {
    const intent = parseAssistantIntent("生成调仓建议");
    expect(intent).toMatchObject({
      kind: "rebalance_generate",
    });
  });
});
