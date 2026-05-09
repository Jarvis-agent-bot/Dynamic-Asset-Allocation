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

  it("执行调仓默认只执行已选建议，明确全部时才执行全部", () => {
    expect(parseAssistantIntent("执行调仓")).toMatchObject({
      kind: "rebalance_execute",
      executeMode: "selected",
    });
    expect(parseAssistantIntent("全部执行调仓")).toMatchObject({
      kind: "rebalance_execute",
      executeMode: "all",
    });
  });

  it("识别大脑状态查询", () => {
    const intent = parseAssistantIntent("你现在这个全权大脑能做什么");
    expect(intent).toMatchObject({
      kind: "brain_status",
    });
  });

  it("识别切换大脑模式", () => {
    const intent = parseAssistantIntent("切到自动驾驶模式");
    expect(intent).toMatchObject({
      kind: "brain_set_mode",
      mode: "autopilot",
    });
  });

  it("识别手动运行认知 Agent", () => {
    const intent = parseAssistantIntent("帮我运行一轮 Agent 调查");
    expect(intent).toMatchObject({
      kind: "agent_run",
    });
  });

  it("识别初始化论点", () => {
    const intent = parseAssistantIntent("初始化当前持仓论点");
    expect(intent).toMatchObject({
      kind: "agent_bootstrap",
    });
  });

  it("只读会话下会把执行命令降级成 llm_answer", () => {
    const intent = parseAssistantIntent("买入 QQQ 10股", {
      allowExecution: false,
    });
    expect(intent).toMatchObject({
      kind: "llm_answer",
      answer: null,
    });
  });

  it("只读会话下会阻止初始化论点写入动作", () => {
    const intent = parseAssistantIntent("初始化当前持仓论点", {
      allowExecution: false,
    });
    expect(intent).toMatchObject({
      kind: "llm_answer",
      answer: null,
    });
  });

  it("只读会话下会阻止切换大脑模式", () => {
    const intent = parseAssistantIntent("切到顾问模式", {
      allowExecution: false,
    });
    expect(intent).toMatchObject({
      kind: "llm_answer",
      answer: null,
    });
  });

  it("对分析型问题优先落到 llm_answer", () => {
    const intent = parseAssistantIntent("你觉得当前这个组合还合理吗，给我一个优化建议");
    expect(intent).toMatchObject({
      kind: "llm_answer",
      answer: null,
    });
  });
});
