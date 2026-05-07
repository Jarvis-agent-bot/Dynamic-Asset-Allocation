import { describe, expect, it } from "vitest";

import {
  getAutopilotRebalanceBlockedReasonAfterRun,
  validateAutopilotPrerequisites,
} from "@/src/daa/agent/autopilotOrchestrator";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";

describe("autopilot-orchestrator", () => {
  it("自动驾驶生成提案只要求自动生成开关，执行开关交给执行层判定", () => {
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
      ],
      reason: "自动驾驶无法生成调仓周期，缺少必要开关：/rebalanceStrategy/autoGenerateEnabled",
    });
  });

  it("只开启自动生成时也可继续生成周期", () => {
    const config = normalizeSystemConfig({
      rebalanceStrategy: {
        autoGenerateEnabled: true,
        autoExecuteEnabled: false,
      },
    });

    expect(validateAutopilotPrerequisites(config)).toEqual({
      ready: true,
      missing: [],
      reason: null,
    });
  });

  it("认知 Agent 本轮存在错误时不应继续进入自动调仓", () => {
    expect(getAutopilotRebalanceBlockedReasonAfterRun([])).toBeNull();
    expect(getAutopilotRebalanceBlockedReasonAfterRun(["observe: market data stale"])).toContain("自动调仓已降级为仅报告");
  });
});
