import { describe, expect, it } from "vitest";

import { validateAutopilotPrerequisites } from "@/src/daa/agent/autopilotOrchestrator";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";

describe("autopilot-orchestrator", () => {
  it("自动驾驶不再自动改配置，而是显式报告缺失的执行开关", () => {
    const config = normalizeSystemConfig({
      cognitiveAgent: {
        enabled: true,
      },
      rebalanceStrategy: {
        autoGenerateEnabled: false,
        autoExecuteEnabled: false,
      },
    });

    expect(validateAutopilotPrerequisites(config)).toEqual({
      ready: false,
      missing: [
        "/rebalanceStrategy/autoGenerateEnabled",
        "/rebalanceStrategy/autoExecuteEnabled",
      ],
      reason: "自动驾驶缺少必要开关：/rebalanceStrategy/autoGenerateEnabled, /rebalanceStrategy/autoExecuteEnabled",
    });
  });

  it("自动驾驶必要开关齐备时可继续运行", () => {
    const config = normalizeSystemConfig({
      rebalanceStrategy: {
        autoGenerateEnabled: true,
        autoExecuteEnabled: true,
      },
    });

    expect(validateAutopilotPrerequisites(config)).toEqual({
      ready: true,
      missing: [],
      reason: null,
    });
  });
});
