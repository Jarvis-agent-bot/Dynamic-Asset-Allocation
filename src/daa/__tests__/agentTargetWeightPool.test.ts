import { describe, expect, it } from "vitest";

import {
  buildAgentTargetWeightPoolPatches,
  resolveAiTargetWeightPoolConfig,
} from "@/src/daa/automation/agentTargetWeightPool";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

describe("agentTargetWeightPool", () => {
  it("默认开启 AI 目标权重池", () => {
    const config = { aiTargetWeightPool: undefined } as unknown as DaaSystemConfig;
    expect(resolveAiTargetWeightPoolConfig(config)).toEqual({
      enabled: true,
      minConfidence: 0,
    });
  });

  it("把 Agent 目标权重转换为 asset_universe.targetWeightHint patch", () => {
    const patches = buildAgentTargetWeightPoolPatches({
      targetWeights: {
        "us::nvda": 0.0833333,
        "US::QQQ": 0,
      },
    });

    expect(patches).toEqual([
      { assetKey: "US::NVDA", targetWeightHint: 0.083333 },
      { assetKey: "US::QQQ", targetWeightHint: 0 },
    ]);
  });

  it("过滤掉无效 assetKey", () => {
    const patches = buildAgentTargetWeightPoolPatches({
      targetWeights: { "": 0.05, "  ": 0.1, "US::AAPL": 0.05 },
    });
    expect(patches).toEqual([{ assetKey: "US::AAPL", targetWeightHint: 0.05 }]);
  });
});
