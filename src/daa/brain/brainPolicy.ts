import {
  type DaaBrainMode,
  type DaaSystemConfig,
} from "@/src/daa/config/systemConfig";

export type DaaBrainAction =
  | "view_context"
  | "generate_rebalance"
  | "simulate_rebalance"
  | "simulate_trade"
  | "run_agent_cycle"
  | "bootstrap_theses";

const MODE_LABELS: Record<DaaBrainMode, string> = {
  advisor: "仅建议",
  operator: "手动复核",
  autopilot: "自动复核",
};

const ACTION_LABELS: Record<DaaBrainAction, string> = {
  view_context: "读取上下文",
  generate_rebalance: "生成调仓建议",
  simulate_rebalance: "执行模拟调仓",
  simulate_trade: "执行模拟交易",
  run_agent_cycle: "运行投资复核",
  bootstrap_theses: "建立初始投资判断",
};

const MODE_ACTIONS: Record<DaaBrainMode, ReadonlySet<DaaBrainAction>> = {
  advisor: new Set(["view_context", "generate_rebalance"]),
  operator: new Set(["view_context", "generate_rebalance", "simulate_rebalance", "simulate_trade", "run_agent_cycle", "bootstrap_theses"]),
  autopilot: new Set(["view_context", "generate_rebalance", "simulate_rebalance", "simulate_trade", "run_agent_cycle", "bootstrap_theses"]),
};

type DaaResolvedBrainConfig = NonNullable<DaaSystemConfig["brain"]>;

export function resolveBrainConfig(config?: DaaSystemConfig["brain"]): DaaResolvedBrainConfig {
  return {
    mode: config?.mode ?? "autopilot",
  };
}

export function buildBrainConfigForMode(
  mode: DaaBrainMode,
  current?: DaaSystemConfig["brain"],
): DaaResolvedBrainConfig {
  const resolved = resolveBrainConfig(current);
  return {
    ...resolved,
    mode,
  };
}

export function getBrainModeLabel(mode: DaaBrainMode): string {
  return MODE_LABELS[mode] || "手动复核";
}

function getBrainActionLabel(action: DaaBrainAction): string {
  return ACTION_LABELS[action] || action;
}

export function canBrainRunAction(systemConfig: DaaSystemConfig, action: DaaBrainAction): {
  allowed: boolean;
  reason: string;
} {
  const brain = resolveBrainConfig(systemConfig.brain);

  if (!MODE_ACTIONS[brain.mode].has(action)) {
    return {
      allowed: false,
      reason: `「${getBrainModeLabel(brain.mode)}」授权等级未开放「${getBrainActionLabel(action)}」。`,
    };
  }

  return {
    allowed: true,
    reason: `「${getBrainModeLabel(brain.mode)}」授权等级允许「${getBrainActionLabel(action)}」。`,
  };
}

export function describeBrainModeSummary(systemConfig: DaaSystemConfig): string {
  const brain = resolveBrainConfig(systemConfig.brain);
  return `${getBrainModeLabel(brain.mode)}授权；配置写入关闭；自动调仓只接受目标权重计划`;
}

export function buildBrainBoundaryText(systemConfig: DaaSystemConfig): string {
  const brain = resolveBrainConfig(systemConfig.brain);
  const modeLabel = getBrainModeLabel(brain.mode);
  if (brain.mode === "advisor") {
    return `${modeLabel}授权：允许读取上下文、生成建议；不允许运行投资复核、建立初始投资判断、模拟执行与配置写入。`;
  }
  if (brain.mode === "autopilot") {
    return `${modeLabel}授权：允许运行投资复核、建立初始投资判断与本地模拟执行；投资助理只能输出目标权重计划，不能自动修改系统配置。`;
  }
  return `${modeLabel}授权：允许运行投资复核、建立初始投资判断与本地模拟执行；配置写入关闭，调仓执行仍遵守现有确认门禁。`;
}
