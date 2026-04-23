import { describe, expect, it } from "vitest";

import { canBrainRunAction, isBrainConfigPatchAllowed } from "@/src/daa/brain/brainPolicy";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";

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
});
