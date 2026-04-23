import { describe, expect, it } from "vitest";

import { buildAutopilotPrerequisitePatches, buildOverlayPatches } from "@/src/daa/agent/autopilotOrchestrator";
import type { AgentConfigOverlay } from "@/src/daa/agent/cognitiveTypes";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";

describe("autopilot-orchestrator", () => {
  it("会补齐全自动大脑闭环所需开关", () => {
    const config = normalizeSystemConfig({
      cognitiveAgent: {
        enabled: true,
        agentOverlayEnabled: false,
        agentTriggerEnabled: false,
      },
      rebalanceStrategy: {
        autoGenerateEnabled: false,
        autoExecuteEnabled: false,
      },
    });

    expect(buildAutopilotPrerequisitePatches(config)).toEqual([
      { path: "/cognitiveAgent/agentOverlayEnabled", value: true },
      { path: "/cognitiveAgent/agentTriggerEnabled", value: true },
      { path: "/rebalanceStrategy/autoGenerateEnabled", value: true },
      { path: "/rebalanceStrategy/autoExecuteEnabled", value: true },
    ]);
  });

  it("会把 overlay 转换为受限的低风险配置 patch", () => {
    const config = normalizeSystemConfig({
      rebalanceStrategy: {
        drift: { thresholdPct: 0.05 },
        autoExecuteMaxSinglePct: 10,
      },
      strategy: {
        constraints: { maxPositionPct: 0.3 },
      },
    });
    const overlay: AgentConfigOverlay = {
      generatedAt: new Date().toISOString(),
      agentRunId: "run-1",
      driftOverrides: [
        { assetKey: "US:NVDA", symbol: "NVDA", recommendedThresholdPct: 0.03, reasoning: "风险升高" },
        { assetKey: "HK:0388", symbol: "0388.HK", recommendedThresholdPct: 0.04, reasoning: "论点分歧" },
      ],
      regimeOverride: null,
      riskAdjustments: [
        { assetKey: "US:NVDA", symbol: "NVDA", maxPositionPctOverride: 0.2, reasoning: "集中度收紧" },
      ],
      rebalanceTrigger: {
        recommended: true,
        urgency: "urgent",
        reasoning: "重大事件触发",
        affectedAssets: ["US:NVDA"],
      },
    };

    expect(buildOverlayPatches(config, overlay)).toEqual([
      { path: "/rebalanceStrategy/drift/thresholdPct", value: 0.035 },
      { path: "/strategy/constraints/maxPositionPct", value: 0.2 },
      { path: "/rebalanceStrategy/autoExecuteMaxSinglePct", value: 8 },
    ]);
  });
});
