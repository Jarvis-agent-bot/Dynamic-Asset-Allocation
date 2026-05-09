import { describe, expect, it } from "vitest";

import {
  applyTargetWeightOverridesToBootstrap,
  buildAgentTargetWeightOverrides,
  buildEmptyAutoTriggerSkipMessage,
  filterRecentAutoTradeReversals,
  findAutoExecuteSingleOrderBreach,
  findAutoExecuteTurnoverBreach,
  shouldSendAgentBriefingTelegram,
} from "@/src/daa/automation/automationGuards";
import type { AgentStrategyOverlay } from "@/src/daa/agent/cognitiveTypes";
import { buildAssetUniverseView, buildSystemConfigRow, buildWorkbenchBootstrap } from "@/src/daa/__tests__/testDataFactories";

describe("automationGuards", () => {
  it("自动触发且没有提案时应跳过生成 cycle", () => {
    expect(buildEmptyAutoTriggerSkipMessage({
      triggerSource: "agent_trigger",
      manual: false,
      proposalCount: 0,
      agentSummary: "Agent 分析: 0 个提案, 2 个跳过 (conviction 不足)",
    })).toBe("Agent 主动调仓未生成可执行提案，跳过创建周期（Agent 分析: 0 个提案, 2 个跳过 (conviction 不足)）。");
  });

  it("手动触发没有提案时不由自动触发护栏拦截", () => {
    expect(buildEmptyAutoTriggerSkipMessage({
      triggerSource: "manual",
      manual: true,
      proposalCount: 0,
      agentSummary: null,
    })).toBeNull();
  });

  it("能识别超过自动执行单笔 NAV 上限的提案", () => {
    const breach = findAutoExecuteSingleOrderBreach({
      totalEquity: 5000,
      maxSinglePct: 0.1,
      proposals: [
        { assetKey: "US::AAPL", symbol: "AAPL", suggestedNotional: 400 },
        { assetKey: "US::NVDA", symbol: "NVDA", suggestedNotional: 800 },
      ],
    });

    expect(breach?.symbol).toBe("NVDA");
    expect(breach?.message).toContain("PolicyExecution 单笔上限");
    expect(breach?.message).toContain("超过 NAV 的 10.0% 上限");
  });

  it("能识别自动执行总换手超过 NAV 上限", () => {
    const breach = findAutoExecuteTurnoverBreach({
      totalEquity: 10000,
      maxTurnoverPct: 0.1,
      proposals: [
        { assetKey: "US::AAPL", symbol: "AAPL", suggestedNotional: 700 },
        { assetKey: "US::MSFT", symbol: "MSFT", suggestedNotional: 600 },
      ],
    });

    expect(breach?.totalNotional).toBe(1300);
    expect(breach?.message).toContain("maxOrderPctOfNav");
    expect(breach?.message).toContain("超过 NAV 的 10.0% 上限");
  });

  it("会过滤自动反向交易冷却期内的同资产反向提案", () => {
    const nowMs = Date.parse("2026-03-10T00:00:00.000Z");
    const result = filterRecentAutoTradeReversals({
      nowMs,
      proposals: [
        {
          assetKey: "US::SPY",
          symbol: "SPY",
          side: "SELL",
          suggestedNotional: 500,
          selected: true,
        },
        {
          assetKey: "US::NVDA",
          symbol: "NVDA",
          side: "BUY",
          suggestedNotional: 500,
          selected: true,
        },
      ],
      recentTrades: [
        {
          ticketId: "ticket-spy-buy",
          assetKey: "US::SPY",
          symbol: "SPY",
          side: "BUY",
          status: "executed",
          executedAt: "2026-03-06T00:00:00.000Z",
        },
      ],
      buyToSellCooldownDays: 14,
    });

    expect(result.proposals.map((row) => row.assetKey)).toEqual(["US::NVDA"]);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]?.blockedReason).toContain("反向交易冷却期");
    expect(result.blocked[0]?.cooldownUntil).toBe("2026-03-20T00:00:00.000Z");
  });

  it("Agent 日报推送必须同时满足 Telegram 开关和 dailyReport 开关", () => {
    const enabled = buildSystemConfigRow({
      notification: {
        telegram: {
          enabled: true,
          dailyReport: true,
        },
      },
    }).config;
    const disabled = buildSystemConfigRow({
      notification: {
        telegram: {
          enabled: true,
          dailyReport: false,
        },
      },
    }).config;

    expect(shouldSendAgentBriefingTelegram(enabled)).toBe(true);
    expect(shouldSendAgentBriefingTelegram(disabled)).toBe(false);
  });

  it("会把 Agent 目标权重计划转换为可执行的目标权重覆盖", () => {
    const overlay: AgentStrategyOverlay = {
      generatedAt: "2026-03-01T00:00:00.000Z",
      agentRunId: "run-1",
      regimeOverride: null,
      targetAllocationPlan: {
        reasoning: "NVDA 论点不收敛，主动降到更小试探仓位。",
        intents: [
          {
            assetKey: "US::NVDA",
            symbol: "NVDA",
            proposedTargetWeightPct: 3,
            confidence: 82,
            reasoning: "降低 AI 拥挤交易风险",
          },
          {
            assetKey: "US::TSLA",
            symbol: "TSLA",
            proposedTargetWeightPct: 12,
            confidence: 40,
            reasoning: "低置信度建议应被忽略",
          },
        ],
      },
    };

    const plan = buildAgentTargetWeightOverrides({
      overlay,
      knownAssetKeys: ["US::NVDA", "US::TSLA"],
      maxPositionPct: 0.1,
      minConfidence: 70,
    });

    expect(plan).toEqual({
      targetWeightOverrides: { "US::NVDA": 0.03 },
      acceptedCount: 1,
      skippedCount: 1,
      reason: "NVDA→3.0%",
      summary: "NVDA 论点不收敛，主动降到更小试探仓位。",
    });
  });

  it("Agent 目标权重计划会按单仓上限截断", () => {
    const overlay: AgentStrategyOverlay = {
      generatedAt: "2026-03-01T00:00:00.000Z",
      agentRunId: "run-1",
      regimeOverride: null,
      targetAllocationPlan: {
        reasoning: "高确信度增配。",
        intents: [
          {
            assetKey: "US::NVDA",
            symbol: "NVDA",
            proposedTargetWeightPct: 25,
            confidence: 95,
            reasoning: "强势但不能越过组合硬上限",
          },
        ],
      },
    };

    const plan = buildAgentTargetWeightOverrides({
      overlay,
      knownAssetKeys: ["US::NVDA"],
      maxPositionPct: 0.1,
      minConfidence: 70,
    });

    expect(plan?.targetWeightOverrides["US::NVDA"]).toBe(0.1);
  });

  it("Agent 目标权重计划拒绝旧版单冒号 assetKey", () => {
    const overlay: AgentStrategyOverlay = {
      generatedAt: "2026-03-01T00:00:00.000Z",
      agentRunId: "run-1",
      regimeOverride: null,
      targetAllocationPlan: {
        reasoning: "只接受 canonical assetKey。",
        intents: [
          {
            assetKey: "US:NVDA",
            symbol: "NVDA",
            proposedTargetWeightPct: 3,
            confidence: 90,
            reasoning: "旧版格式应被跳过",
          },
        ],
      },
    };

    const plan = buildAgentTargetWeightOverrides({
      overlay,
      knownAssetKeys: ["US::NVDA"],
      maxPositionPct: 0.1,
      minConfidence: 70,
    });

    expect(plan).toBeNull();
  });

  it("Agent 加仓必须有高/中 conviction 论点支持，但降仓可直接进入风控", () => {
    const overlay: AgentStrategyOverlay = {
      generatedAt: "2026-03-01T00:00:00.000Z",
      agentRunId: "run-1",
      regimeOverride: null,
      targetAllocationPlan: {
        reasoning: "一个加仓、一个降仓。",
        intents: [
          {
            assetKey: "US::SPY",
            symbol: "SPY",
            proposedTargetWeightPct: 5,
            confidence: 90,
            reasoning: "没有论点支持的新增仓位应跳过",
          },
          {
            assetKey: "US::NVDA",
            symbol: "NVDA",
            proposedTargetWeightPct: 3,
            confidence: 90,
            reasoning: "降仓是风险收缩",
          },
          {
            assetKey: "US::MSFT",
            symbol: "MSFT",
            proposedTargetWeightPct: 4,
            confidence: 90,
            reasoning: "没有 canonical 论点支持的新增仓位应跳过",
          },
        ],
      },
    };

    const plan = buildAgentTargetWeightOverrides({
      overlay,
      knownAssetKeys: ["US::SPY", "US::NVDA", "US::MSFT"],
      currentTargetWeights: {
        "US::SPY": 0,
        "US::NVDA": 0.1,
        "US::MSFT": 0,
      },
      supportedIncreaseAssetKeys: ["US::NVDA", "US:MSFT"],
      maxPositionPct: 0.1,
      minConfidence: 70,
    });

    expect(plan?.targetWeightOverrides).toEqual({ "US::NVDA": 0.03 });
    expect(plan?.skippedCount).toBe(2);
  });

  it("目标权重覆盖会重算 workbench 资产目标与偏移", () => {
    const bootstrap = buildWorkbenchBootstrap({
      account: { totalEquity: 10000, cash: 8000, investableCash: 8000, frozenCash: 0 },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::NVDA",
          symbol: "NVDA",
          actualWeightPct: 10,
          targetWeightPct: 10,
          gapPct: 0,
        }),
        buildAssetUniverseView({
          assetKey: "HK::0388",
          symbol: "0388.HK",
          actualWeightPct: 8,
          targetWeightPct: 8,
          gapPct: 0,
        }),
      ],
    });

    const next = applyTargetWeightOverridesToBootstrap(bootstrap, {
      "US::NVDA": 0.03,
    });

    expect(next.assetUniverse[0]?.targetWeightPct).toBe(3);
    expect(next.assetUniverse[0]?.gapPct).toBe(-7);
    expect(next.assetUniverse[1]?.targetWeightPct).toBe(8);
    expect(next).not.toBe(bootstrap);
  });

  it("目标权重覆盖可作用于无持仓观察列表资产，后续执行层会转成 BUY 偏移", () => {
    const bootstrap = buildWorkbenchBootstrap({
      account: { totalEquity: 10000, cash: 8000, investableCash: 8000, frozenCash: 0 },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::QQQ",
          symbol: "QQQ",
          watchEnabled: true,
          holdingQty: 0,
          actualWeightPct: 0,
          targetWeightPct: 0,
          gapPct: null,
        }),
      ],
    });

    const next = applyTargetWeightOverridesToBootstrap(bootstrap, {
      "US::QQQ": 0.05,
    });

    expect(next.assetUniverse[0]?.targetWeightPct).toBe(5);
    expect(next.assetUniverse[0]?.gapPct).toBe(5);
  });
});
