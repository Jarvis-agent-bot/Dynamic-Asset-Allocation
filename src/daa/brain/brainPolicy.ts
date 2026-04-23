import type { DaaBrainMode, DaaSystemConfig } from "@/src/daa/config/systemConfig";

export type DaaBrainAction =
  | "view_context"
  | "generate_rebalance"
  | "simulate_rebalance"
  | "simulate_trade"
  | "run_agent_cycle"
  | "bootstrap_theses"
  | "propose_config_patch"
  | "apply_config_patch";

const MODE_LABELS: Record<DaaBrainMode, string> = {
  advisor: "顾问",
  operator: "操作员",
  autopilot: "自动驾驶",
};

const ACTION_LABELS: Record<DaaBrainAction, string> = {
  view_context: "读取上下文",
  generate_rebalance: "生成调仓建议",
  simulate_rebalance: "执行模拟调仓",
  simulate_trade: "执行模拟交易",
  run_agent_cycle: "运行认知循环",
  bootstrap_theses: "初始化论点",
  propose_config_patch: "生成配置 patch",
  apply_config_patch: "自动落地配置 patch",
};

const MODE_ACTIONS: Record<DaaBrainMode, ReadonlySet<DaaBrainAction>> = {
  advisor: new Set(["view_context", "generate_rebalance"]),
  operator: new Set(["view_context", "generate_rebalance", "simulate_rebalance", "simulate_trade", "run_agent_cycle", "bootstrap_theses", "propose_config_patch"]),
  autopilot: new Set(["view_context", "generate_rebalance", "simulate_rebalance", "simulate_trade", "run_agent_cycle", "bootstrap_theses", "propose_config_patch", "apply_config_patch"]),
};

export type DaaResolvedBrainConfig = NonNullable<DaaSystemConfig["brain"]>;

export function resolveBrainConfig(config?: DaaSystemConfig["brain"]): DaaResolvedBrainConfig {
  return {
    mode: config?.mode ?? "operator",
    allowConfigPatch: config?.allowConfigPatch ?? true,
    autoApplyLowRiskPatch: config?.autoApplyLowRiskPatch ?? false,
    configPatchWhitelist: Array.isArray(config?.configPatchWhitelist) ? config.configPatchWhitelist : [],
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
    allowConfigPatch: mode === "advisor" ? false : true,
    autoApplyLowRiskPatch: mode === "autopilot",
  };
}

export function getBrainModeLabel(mode: DaaBrainMode): string {
  return MODE_LABELS[mode] || "操作员";
}

export function getBrainActionLabel(action: DaaBrainAction): string {
  return ACTION_LABELS[action] || action;
}

export function isBrainConfigPatchAllowed(systemConfig: DaaSystemConfig, path: string): boolean {
  const brain = resolveBrainConfig(systemConfig.brain);
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath || !brain.allowConfigPatch) return false;
  return brain.configPatchWhitelist.some((item) => String(item || "").trim() === normalizedPath);
}

export function canBrainRunAction(systemConfig: DaaSystemConfig, action: DaaBrainAction): {
  allowed: boolean;
  reason: string;
} {
  const brain = resolveBrainConfig(systemConfig.brain);

  if (!MODE_ACTIONS[brain.mode].has(action)) {
    return {
      allowed: false,
      reason: `${getBrainModeLabel(brain.mode)}模式下未开放「${getBrainActionLabel(action)}」。`,
    };
  }

  if ((action === "propose_config_patch" || action === "apply_config_patch") && !brain.allowConfigPatch) {
    return {
      allowed: false,
      reason: "当前未开放配置 patch 权限。",
    };
  }

  if (action === "apply_config_patch" && !brain.autoApplyLowRiskPatch) {
    return {
      allowed: false,
      reason: "当前仅允许生成配置 patch，不允许自动落地。",
    };
  }

  return {
    allowed: true,
    reason: `${getBrainModeLabel(brain.mode)}模式允许「${getBrainActionLabel(action)}」。`,
  };
}

export function describeBrainModeSummary(systemConfig: DaaSystemConfig): string {
  const brain = resolveBrainConfig(systemConfig.brain);
  const configWriteState = !brain.allowConfigPatch
    ? "配置 patch 关闭"
    : brain.autoApplyLowRiskPatch
      ? "白名单 patch 可自动落地"
      : "仅生成 patch 建议";
  const whitelistSummary = brain.configPatchWhitelist.length > 0
    ? `白名单 ${brain.configPatchWhitelist.length} 项`
    : "白名单未配置";

  return `${getBrainModeLabel(brain.mode)}模式；${configWriteState}；${whitelistSummary}`;
}

export function buildBrainBoundaryText(systemConfig: DaaSystemConfig): string {
  const brain = resolveBrainConfig(systemConfig.brain);
  const modeLabel = getBrainModeLabel(brain.mode);
  if (brain.mode === "advisor") {
    return `${modeLabel}模式：允许读取上下文、生成建议；不允许运行认知循环、初始化论点、模拟执行与配置写入。`;
  }
  if (brain.mode === "autopilot") {
    return `${modeLabel}模式：允许运行认知循环、初始化论点与模拟执行；模拟交易/调仓仍遵守现有确认门禁；白名单配置 patch ${brain.allowConfigPatch ? (brain.autoApplyLowRiskPatch ? "可自动落地" : "仅生成建议") : "关闭"}。`;
  }
  return `${modeLabel}模式：允许运行认知循环、初始化论点与模拟执行；模拟交易/调仓仍遵守现有确认门禁；配置 patch ${brain.allowConfigPatch ? "仅生成建议" : "关闭"}。`;
}
