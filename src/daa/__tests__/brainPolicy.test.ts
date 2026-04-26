import { describe, expect, it } from "vitest";

import {
  buildBrainBoundaryText,
  buildBrainConfigForMode,
  canBrainRunAction,
  describeBrainModeSummary,
  resolveBrainConfig,
} from "@/src/daa/brain/brainPolicy";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";

describe("brain-policy", () => {
  it("advisor 模式只允许只读建议，不允许运行认知循环和模拟执行", () => {
    const config = normalizeSystemConfig({
      brain: {
        mode: "advisor",
      },
    });

    expect(canBrainRunAction(config, "view_context").allowed).toBe(true);
    expect(canBrainRunAction(config, "generate_rebalance").allowed).toBe(true);
    expect(canBrainRunAction(config, "run_agent_cycle").allowed).toBe(false);
    expect(canBrainRunAction(config, "simulate_trade").allowed).toBe(false);
  });

  it("operator 模式允许人工触发认知循环和本地模拟执行", () => {
    const config = normalizeSystemConfig({
      brain: {
        mode: "operator",
      },
    });

    expect(canBrainRunAction(config, "run_agent_cycle").allowed).toBe(true);
    expect(canBrainRunAction(config, "bootstrap_theses").allowed).toBe(true);
    expect(canBrainRunAction(config, "simulate_trade").allowed).toBe(true);
  });

  it("autopilot 模式仍不包含自动配置写入权限", () => {
    const config = normalizeSystemConfig({
      brain: {
        mode: "autopilot",
      },
    });

    expect(canBrainRunAction(config, "run_agent_cycle").allowed).toBe(true);
    expect(describeBrainModeSummary(config)).toContain("配置写入关闭");
    expect(buildBrainBoundaryText(config)).toContain("不能自动修改系统配置");
  });

  it("默认大脑配置是自动驾驶，并启用本地自动调仓闭环", () => {
    const config = normalizeSystemConfig({});
    expect(config.brain?.mode).toBe("autopilot");
    expect(config.rebalanceStrategy.autoGenerateEnabled).toBe(true);
    expect(config.rebalanceStrategy.autoExecuteEnabled).toBe(true);
  });

  it("缺省解析只回退模式，不恢复旧自动配置权限", () => {
    const brain = resolveBrainConfig(undefined);
    expect(brain).toEqual({ mode: "autopilot" });
  });

  it("模式预设只改变大脑模式", () => {
    expect(buildBrainConfigForMode("advisor")).toEqual({ mode: "advisor" });
    expect(buildBrainConfigForMode("operator")).toEqual({ mode: "operator" });
    expect(buildBrainConfigForMode("autopilot")).toEqual({ mode: "autopilot" });
  });
});
