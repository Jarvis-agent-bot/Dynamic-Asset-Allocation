import { describe, expect, it } from "vitest";

import {
  buildDaaNotificationText,
  buildDriftNotificationText,
  buildRebalanceSuggestionNotificationText,
  buildRiskTriggerNotificationText,
} from "@/src/daa/notify/telegramNotificationComposer";

describe("telegramNotificationComposer", () => {
  it("用统一结构渲染行动类通知", () => {
    const text = buildDaaNotificationText({
      severity: "actionable",
      category: "rebalance",
      title: "调仓建议已生成",
      status: "已生成 2 条建议，等待审核",
      facts: [
        { label: "周期", value: "cycle-1" },
        { label: "风控", value: "pass" },
      ],
      highlights: ["AAPL 买入 1000.00 USD", "MU 卖出 500.00 USD"],
      nextAction: "请在工作台审核建议；成交结果会单独推送。",
      source: "daily-analysis",
      occurredAt: "2026-06-22T01:03:00.000Z",
    });

    expect(text).toContain("[行动] 调仓 | 调仓建议已生成");
    expect(text).toContain("状态: 已生成 2 条建议，等待审核");
    expect(text).toContain("周期: cycle-1");
    expect(text).toContain("重点:");
    expect(text).toContain("- AAPL 买入 1000.00 USD");
    expect(text).toContain("下一步: 请在工作台审核建议；成交结果会单独推送。");
    expect(text).toContain("来源: daily-analysis");
  });

  it("调仓建议只展示核心建议和下一步", () => {
    const text = buildRebalanceSuggestionNotificationText({
      cycleId: "cycle-1",
      triggerReason: "定期组合复盘",
      riskStatus: "pass",
      proposals: [
        { symbol: "AAPL", side: "BUY", suggestedNotional: 1000 },
        { symbol: "MU", side: "SELL", suggestedNotional: 500 },
      ],
      agentDecisionSnapshot: {
        status: "ok",
        summary: "组合偏离目标权重，需要小幅再平衡。",
        keyRisks: ["市场波动"],
        keyOpportunities: ["现金利用率提升"],
        overallConfidence: 72,
      },
      source: "daily-analysis",
    });

    expect(text).toContain("[行动] 调仓 | 调仓建议已生成");
    expect(text).toContain("状态: 已生成 2 条建议，风控 pass");
    expect(text).toContain("模型: 组合偏离目标权重，需要小幅再平衡。");
    expect(text).toContain("- AAPL 买入 1000.00");
    expect(text).toContain("下一步: 请在工作台审核建议；若自动执行获授权，成交结果会单独推送。");
  });

  it("偏移有新周期时归为调仓行动，没有新周期时返回可记录的摘要", () => {
    const actionText = buildDriftNotificationText({
      newCycleCreated: true,
      cycleId: "cycle-drift-1",
      reason: "偏移量阈值触发",
      driftedAssetCount: 2,
      driftLines: ["AAPL: gap 6.0%", "BND: gap -5.4%"],
      proposalCount: 3,
      riskStatus: "warn",
      source: "drift-check",
    });
    const infoText = buildDriftNotificationText({
      newCycleCreated: false,
      cycleId: null,
      reason: "冷静期生效中",
      driftedAssetCount: 2,
      driftLines: ["AAPL: gap 6.0%"],
      proposalCount: 0,
      riskStatus: null,
      source: "drift-check",
    });

    expect(actionText).toContain("[行动] 调仓 | 调仓建议已生成");
    expect(actionText).toContain("状态: 已生成调仓周期 cycle-drift-1");
    expect(actionText).toContain("触发: 偏移越界");
    expect(actionText).toContain("下一步: 请优先审核本轮调仓建议；若自动执行获授权，成交结果会单独推送。");
    expect(infoText).toContain("[摘要] 调仓 | 偏移越界记录");
    expect(infoText).toContain("状态: 未生成新周期：冷静期生效中");
    expect(infoText).toContain("下一步: 已纳入每日复核/投资助理简报，无需单独处理。");
  });

  it("止盈止损通知合并即时 agent 审核结果", () => {
    const text = buildRiskTriggerNotificationText({
      stopLossCount: 1,
      takeProfitCount: 1,
      ignoredCount: 2,
      assets: [
        { label: "ETH-USD", triggerType: "stop_loss", pnlPct: -22.8 },
        { label: "MU", triggerType: "take_profit", pnlPct: 35.5 },
      ],
      agentReview: {
        attempted: true,
        skipped: false,
        reason: "已生成风险调仓周期",
        runId: "agent-run-risk-1",
        cycleId: "cycle-risk-1",
        proposalCount: 2,
      },
      source: "drift-check",
    });

    expect(text).toContain("[紧急] 风控 | 止盈/止损触发");
    expect(text).toContain("状态: 已完成即时审核，生成 2 条建议");
    expect(text).toContain("触发: 止损 1 项 / 止盈 1 项");
    expect(text).toContain("尘埃仓: 已忽略 2 项");
    expect(text).toContain("- ETH-USD: 止损 -22.8%");
    expect(text).toContain("下一步: 请优先查看风险调仓周期 cycle-risk-1。");
  });
});
