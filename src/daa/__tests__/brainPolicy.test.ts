import { describe, expect, it } from "vitest";

import { buildBrainConfigForMode, canBrainRunAction, isBrainConfigPatchAllowed, resolveBrainConfig } from "@/src/daa/brain/brainPolicy";
import { DEFAULT_BRAIN_CONFIG_PATCH_WHITELIST_, normalizeSystemConfig } from "@/src/daa/config/systemConfig";

describe("brain-policy", () => {
  it("advisor 模式会强制关闭配置写入与自动落地", () => {
    const config = normalizeSystemConfig({
      brain: {
        mode: "advisor",
        allowConfigPatch: true,
        autoApplyLowRiskPatch: true,
        configPatchWhitelist: ["/rebalanceStrategy/analysisFocus"],
      },
    });

    expect(config.brain?.mode).toBe("advisor");
    expect(config.brain?.allowConfigPatch).toBe(false);
    expect(config.brain?.autoApplyLowRiskPatch).toBe(false);
  });

  it("operator 模式允许认知循环，但不允许自动落地配置", () => {
    const config = normalizeSystemConfig({
      brain: {
        mode: "operator",
        allowConfigPatch: true,
        autoApplyLowRiskPatch: false,
        configPatchWhitelist: ["/rebalanceStrategy/analysisFocus"],
      },
    });

    expect(canBrainRunAction(config, "run_agent_cycle").allowed).toBe(true);
    expect(canBrainRunAction(config, "simulate_trade").allowed).toBe(true);
    expect(canBrainRunAction(config, "apply_config_patch").allowed).toBe(false);
    expect(isBrainConfigPatchAllowed(config, "/rebalanceStrategy/analysisFocus")).toBe(true);
  });

  it("autopilot + 白名单开启后才允许自动落地配置", () => {
    const config = normalizeSystemConfig({
      brain: {
        mode: "autopilot",
        allowConfigPatch: true,
        autoApplyLowRiskPatch: true,
        configPatchWhitelist: ["/dataSources/llmModels"],
      },
    });

    expect(canBrainRunAction(config, "apply_config_patch").allowed).toBe(true);
    expect(isBrainConfigPatchAllowed(config, "/dataSources/llmModels")).toBe(true);
    expect(isBrainConfigPatchAllowed(config, "/notification/telegram/enabled")).toBe(false);
  });

  it("默认大脑配置是自动驾驶，并包含事件驱动闭环白名单", () => {
    const config = normalizeSystemConfig({});
    expect(config.brain?.mode).toBe("autopilot");
    expect(config.brain?.autoApplyLowRiskPatch).toBe(true);
    expect(config.rebalanceStrategy.autoGenerateEnabled).toBe(true);
    expect(config.rebalanceStrategy.autoExecuteEnabled).toBe(true);
    expect(config.cognitiveAgent?.agentOverlayEnabled).toBe(true);
    expect(config.cognitiveAgent?.agentTriggerEnabled).toBe(true);
    expect(DEFAULT_BRAIN_CONFIG_PATCH_WHITELIST_).toContain("/cognitiveAgent/agentOverlayEnabled");
    expect(DEFAULT_BRAIN_CONFIG_PATCH_WHITELIST_).toContain("/rebalanceStrategy/autoExecuteEnabled");
  });

  it("缺省解析会回退到全权大脑安全白名单", () => {
    const brain = resolveBrainConfig(undefined);
    expect(brain.mode).toBe("autopilot");
    expect(brain.autoApplyLowRiskPatch).toBe(true);
    expect(brain.configPatchWhitelist).toContain("/rebalanceStrategy/drift/thresholdPct");
  });

  it("模式预设会给出一致的布尔权限", () => {
    expect(buildBrainConfigForMode("advisor").allowConfigPatch).toBe(false);
    expect(buildBrainConfigForMode("operator").allowConfigPatch).toBe(true);
    expect(buildBrainConfigForMode("autopilot").autoApplyLowRiskPatch).toBe(true);
  });
});
