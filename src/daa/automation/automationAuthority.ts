import {
  canBrainRunAction,
  type DaaBrainAction,
} from "@/src/daa/brain/brainPolicy";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { RebalanceTriggerSource } from "@/src/daa/modules/workbench/workbenchTypes";

export type AutomationAuthorityDecision = {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
  checks: Array<{
    id: string;
    passed: boolean;
    message: string;
  }>;
};

export type AutomationAuthorityTrigger =
  | RebalanceTriggerSource
  | "cron_daily_analysis"
  | "cron_drift_check"
  | "cron_cognitive_agent"
  | "manual_api"
  | "alpaca_ws_realtime"
  | "cron_news_refresh"
  | "system";

function pushCheck(
  checks: AutomationAuthorityDecision["checks"],
  id: string,
  passed: boolean,
  message: string,
) {
  checks.push({ id, passed, message });
}

function finalize(
  checks: AutomationAuthorityDecision["checks"],
  successReason = "自动执行授权通过。",
): AutomationAuthorityDecision {
  const failed = checks.find((check) => !check.passed);
  if (failed) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: failed.message,
      checks,
    };
  }
  return {
    allowed: true,
    requiresConfirmation: false,
    reason: successReason,
    checks,
  };
}

export function evaluateBrainActionAuthority(input: {
  systemConfig: DaaSystemConfig;
  action: DaaBrainAction;
}): AutomationAuthorityDecision {
  const checks: AutomationAuthorityDecision["checks"] = [];
  const permission = canBrainRunAction(input.systemConfig, input.action);
  pushCheck(checks, "brain-mode-action", permission.allowed, permission.reason);
  return finalize(checks, "大脑动作授权通过。");
}

export function evaluateAutoRebalanceAuthority(input: {
  systemConfig: DaaSystemConfig;
  triggerSource: AutomationAuthorityTrigger;
  cycleId?: string | null;
  proposalCount: number;
  executionVenueMode?: "local" | "remote" | "unknown";
}): AutomationAuthorityDecision {
  const checks: AutomationAuthorityDecision["checks"] = [];
  const strategy = input.systemConfig.rebalanceStrategy;
  const venueMode = input.executionVenueMode ?? "local";

  const brainPermission = canBrainRunAction(input.systemConfig, "simulate_rebalance");
  pushCheck(checks, "brain-mode-simulate-rebalance", brainPermission.allowed, brainPermission.reason);

  pushCheck(
    checks,
    "auto-generate-enabled",
    strategy.autoGenerateEnabled === true,
    "自动生成未开启，不能进入自动执行。",
  );
  pushCheck(
    checks,
    "auto-execute-enabled",
    strategy.autoExecuteEnabled === true,
    "自动执行未开启。",
  );
  pushCheck(
    checks,
    "local-execution-venue",
    venueMode === "local",
    "自动执行仅允许本地模拟执行网关。",
  );
  pushCheck(
    checks,
    "cycle-present",
    Boolean(input.cycleId),
    "缺少可执行的再平衡周期。",
  );
  pushCheck(
    checks,
    "proposal-present",
    input.proposalCount > 0,
    "没有可执行提案，跳过自动执行。",
  );

  return finalize(checks);
}

export function evaluateManualRebalanceAuthority(input: {
  systemConfig: DaaSystemConfig;
  cycleId?: string | null;
  proposalCount: number;
  executionVenueMode?: "local" | "remote" | "unknown";
}): AutomationAuthorityDecision {
  const checks: AutomationAuthorityDecision["checks"] = [];
  const venueMode = input.executionVenueMode ?? "local";

  const brainPermission = canBrainRunAction(input.systemConfig, "simulate_rebalance");
  pushCheck(checks, "brain-mode-simulate-rebalance", brainPermission.allowed, brainPermission.reason);
  pushCheck(
    checks,
    "local-execution-venue",
    venueMode === "local",
    "手动调仓执行仅允许本地模拟执行网关。",
  );
  pushCheck(
    checks,
    "cycle-present",
    Boolean(input.cycleId),
    "缺少可执行的再平衡周期。",
  );
  pushCheck(
    checks,
    "proposal-present",
    input.proposalCount > 0,
    "没有可执行提案，不能执行调仓。",
  );

  return finalize(checks, "手动执行授权通过。");
}
