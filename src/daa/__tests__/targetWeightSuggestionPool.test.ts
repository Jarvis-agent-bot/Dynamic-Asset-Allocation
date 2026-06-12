import { describe, expect, it } from "vitest";

import {
  buildTargetWeightSuggestionPatches,
  resolveTargetWeightSuggestionPoolConfig,
} from "@/src/daa/automation/targetWeightSuggestionPool";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

describe("targetWeightSuggestionPool", () => {
  it("默认开启目标权重建议池", () => {
    const config = { aiTargetWeightPool: undefined } as unknown as DaaSystemConfig;
    expect(resolveTargetWeightSuggestionPoolConfig(config)).toEqual({
      enabled: true,
      minConfidence: 0,
    });
  });

  it("把目标权重建议转换为 asset_universe.targetWeightHint patch", () => {
    const patches = buildTargetWeightSuggestionPatches({
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
    const patches = buildTargetWeightSuggestionPatches({
      targetWeights: { "": 0.05, "  ": 0.1, "US::AAPL": 0.05 },
    });
    expect(patches).toEqual([{ assetKey: "US::AAPL", targetWeightHint: 0.05 }]);
  });
});
