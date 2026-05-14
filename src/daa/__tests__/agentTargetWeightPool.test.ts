import { describe, expect, it } from "vitest";

import {
  buildAgentTargetWeightPoolPatches,
  resolveAiTargetWeightPoolConfig,
} from "@/src/daa/automation/agentTargetWeightPool";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

describe("agentTargetWeightPool", () => {
  it("默认不开启 AI 目标权重池，但保留 70 分置信度门槛", () => {
    const config = { watchlistEntry: undefined } as DaaSystemConfig;
    expect(resolveAiTargetWeightPoolConfig(config)).toEqual({
      enabled: false,
      minConfidence: 70,
      autoEnableEntry: true,
    });
  });

  it("会把 Agent 目标权重转换为观察池目标权重与 auto-entry 百分比", () => {
    const patches = buildAgentTargetWeightPoolPatches({
      targetWeightOverrides: {
        "us::nvda": 0.0833333,
        "US::QQQ": 0,
      },
      autoEnableEntry: true,
    });

    expect(patches).toEqual([
      {
        assetKey: "US::NVDA",
        targetWeightHint: 0.083333,
        autoEntryEnabled: true,
        entryTargetWeightPct: 8.3333,
      },
      {
        assetKey: "US::QQQ",
        targetWeightHint: 0,
        autoEntryEnabled: false,
        entryTargetWeightPct: null,
      },
    ]);
  });

  it("关闭同步 auto-entry 时只写目标权重，不打开单资产自动建仓", () => {
    const patches = buildAgentTargetWeightPoolPatches({
      targetWeightOverrides: { "US::AAPL": 0.05 },
      autoEnableEntry: false,
    });

    expect(patches[0]).toMatchObject({
      assetKey: "US::AAPL",
      targetWeightHint: 0.05,
      autoEntryEnabled: false,
      entryTargetWeightPct: null,
    });
  });
});
