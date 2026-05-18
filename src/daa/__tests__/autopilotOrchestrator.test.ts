import { describe, expect, it } from "vitest";

import {
  getAutopilotRebalanceBlockedReasonAfterRun,
  resolveAutopilotExecutionTriggerSource,
  resolveAutopilotRebalanceTriggerSource,
  validateAutopilotPrerequisites,
} from "@/src/daa/agent/autopilotOrchestrator";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";

describe("autopilot-orchestrator", () => {
  it("自动驾驶生成提案只要求自动生成开关，执行开关交给执行层判定", () => {
    const config = normalizeSystemConfig({
      cognitiveAgent: {
        enabled: true,
      },
      policy: {
        execution: {
          autoGenerateEnabled: false,
          autoExecuteEnabled: false,
        },
      },
    });

    expect(validateAutopilotPrerequisites(config)).toEqual({
      ready: false,
      missing: [
        "/policy/execution/autoGenerateEnabled",
      ],
      reason: "自动驾驶无法生成调仓周期，缺少必要开关：/policy/execution/autoGenerateEnabled",
    });
  });

  it("只开启自动生成时也可继续生成周期", () => {
    const config = normalizeSystemConfig({
      policy: {
        execution: {
          autoGenerateEnabled: true,
          autoExecuteEnabled: false,
        },
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

  it("定期 Agent 审核归入 scheduled_review，事件新闻仍走 agent_trigger", () => {
    expect(resolveAutopilotRebalanceTriggerSource("cron_cognitive_agent")).toBe("scheduled_review");
    expect(resolveAutopilotExecutionTriggerSource("cron_cognitive_agent")).toBe("cron_cognitive_agent");
    expect(resolveAutopilotRebalanceTriggerSource("cron_news_refresh")).toBe("agent_trigger");
    expect(resolveAutopilotExecutionTriggerSource("alpaca_ws_realtime")).toBe("agent_trigger");
  });
});
