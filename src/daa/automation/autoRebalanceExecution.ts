import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { evaluateAutoRebalanceAuthority, type AutomationAuthorityDecision, type AutomationAuthorityTrigger } from "@/src/daa/automation/automationAuthority";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";
import type { PolicyDecisionSnapshot } from "@/src/daa/modules/policy-engine/policyTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type { PreTradeRiskCheck, RebalanceProposal } from "@/src/daa/modules/rebalance/rebalanceTypes";
import { listDaaTradeTickets } from "@/src/daa/store/daaStorePg";

import {
  filterAutoTradeStability,
  findAutoExecuteSingleOrderBreach,
  findAutoExecuteTurnoverBreach,
} from "./automationGuards";

type AutoRebalanceExecutionResult = {
  attempted: boolean;
  executed: boolean;
  ordersCount: number;
  blockedReason: string | null;
  error: string | null;
  authority: AutomationAuthorityDecision | null;
};

async function notifyAutoExecutionIssue(input: {
  systemConfig: DaaSystemConfig;
  eventType: "auto_execute_blocked" | "auto_execute_failed";
  triggerSource: string;
  cycleId: string;
  message: string;
  requestJson: Record<string, unknown>;
}) {
  const notif = input.systemConfig.notification;
  const sends: Promise<boolean>[] = [];
  if (notif.telegram.enabled && notif.telegram.onTradeExecuted) {
    sends.push(sendTelegramByEnv(input.message, {
      eventType: input.eventType,
      triggerSource: input.triggerSource,
      cycleId: input.cycleId,
      requestJson: input.requestJson,
    }));
  }
  if (notif.feishu.enabled && notif.feishu.onTradeExecuted) {
    sends.push(sendFeishuByEnv(input.message, {
      eventType: input.eventType,
      triggerSource: input.triggerSource,
      cycleId: input.cycleId,
      requestJson: input.requestJson,
    }));
  }
  await Promise.allSettled(sends);
}

function selectedProposals(proposals: RebalanceProposal[]): RebalanceProposal[] {
  return proposals.filter((row) => row.selected !== false);
}

function shouldApplyExecutionStabilityGuard(triggerSource: AutomationAuthorityTrigger): boolean {
  return triggerSource !== "manual" && triggerSource !== "manual_api" && triggerSource !== "risk";
}

function findAutoExecutionRiskBreach(input: {
  riskCheck?: PreTradeRiskCheck | null;
  proposals: RebalanceProposal[];
}): string | null {
  const riskCheck = input.riskCheck ?? null;
  if (!riskCheck || riskCheck.overallStatus === "pass") return null;

  const selected = selectedProposals(input.proposals);
  const pureRiskReductionSell = selected.length > 0 && selected.every((row) => row.side === "SELL");
  if (riskCheck.overallStatus === "warn" && pureRiskReductionSell) return null;

  const items = Array.isArray(riskCheck.items) ? riskCheck.items : [];
  const firstItem = items.find((item) => item.status !== "pass") ?? null;
  const detail = firstItem ? `；${firstItem.rule}: ${firstItem.message}` : "";
  return `[preTradeRiskCheck 守门] 自动执行要求风控完全通过，当前状态为 ${riskCheck.overallStatus}${detail}`;
}

export async function executeAutoRebalanceCycle(input: {
  cycle: Pick<RebalanceCycle, "cycleId" | "proposals"> & {
    riskCheck?: PreTradeRiskCheck | null;
    policySnapshot?: PolicyDecisionSnapshot | null;
  };
  systemConfig: DaaSystemConfig;
  triggerSource: AutomationAuthorityTrigger;
  totalEquity?: number | null;
}): Promise<AutoRebalanceExecutionResult> {
  const base: AutoRebalanceExecutionResult = {
    attempted: true,
    executed: false,
    ordersCount: 0,
    blockedReason: null,
    error: null,
    authority: null,
  };

  const selectedProposalCount = selectedProposals(input.cycle.proposals).length;
  const fullyAutonomousAgent = input.triggerSource === "agent_trigger";
  const authority = evaluateAutoRebalanceAuthority({
    systemConfig: input.systemConfig,
    triggerSource: input.triggerSource,
    cycleId: input.cycle.cycleId,
    proposalCount: selectedProposalCount,
    executionVenueMode: "local",
  });
  if (!authority.allowed) {
    return {
      ...base,
      attempted: false,
      blockedReason: authority.reason,
      error: authority.reason,
      authority,
    };
  }

  const policyAction = input.cycle.policySnapshot?.decision.action ?? null;
  if (!fullyAutonomousAgent && policyAction && policyAction !== "authorize_auto_execute") {
    const message = `[PolicyEngine 守门] 策略决策为 ${policyAction}，本轮仅允许生成/审阅建议，不自动执行。`;
    logSwallowed(`${input.triggerSource}.autoExecutePolicyGate`, new Error(message));
    return {
      ...base,
      blockedReason: message,
      error: message,
      authority,
    };
  }

  const applyExecutionStabilityGuard = shouldApplyExecutionStabilityGuard(input.triggerSource);
  const bootstrap = input.totalEquity == null || applyExecutionStabilityGuard
    ? await buildWorkbenchBootstrap({ syncPrices: false })
    : null;
  const totalEquity = input.totalEquity == null
    ? Math.max(0, bootstrap?.account.totalEquity ?? 0)
    : Math.max(0, Number(input.totalEquity) || 0);

  if (applyExecutionStabilityGuard) {
    const recentTrades = await listDaaTradeTickets({ status: "executed", limit: 300 }).catch((error) => {
      logSwallowed(`${input.triggerSource}.autoExecuteStabilityTrades`, error);
      return [];
    });
    const currentTargetWeightPctByAssetKey = Object.fromEntries(
      (bootstrap?.assetUniverse ?? [])
        .map((row) => [
          String(row.assetKey || "").trim().toUpperCase(),
          Math.max(0, Number(row.targetWeightPct) || 0),
        ] as const)
        .filter(([assetKey]) => assetKey),
    );
    const stability = filterAutoTradeStability({
      proposals: input.cycle.proposals,
      recentTrades,
      totalEquity,
      currentTargetWeightPctByAssetKey,
    });
    if (stability.blocked.length > 0) {
      const message = `[自动交易稳定器] ${stability.blocked.map((row) => row.blockedReason).join("；")} 请等待冷却窗口结束或重新生成周期。`;
      logSwallowed(`${input.triggerSource}.autoExecuteStabilityGate`, new Error(message));
      await notifyAutoExecutionIssue({
        systemConfig: input.systemConfig,
        eventType: "auto_execute_blocked",
        triggerSource: input.triggerSource,
        cycleId: input.cycle.cycleId,
        message: `[自动执行已阻止]\n周期 ${input.cycle.cycleId}\n${message}`,
        requestJson: { reason: "auto_trade_stability", blockedCount: stability.blocked.length },
      }).catch((err) => logSwallowed(`${input.triggerSource}.autoExecuteStabilityNotify`, err));
      return {
        ...base,
        blockedReason: message,
        authority,
      };
    }
  }

  const maxSinglePct = resolvePolicyConfig(input.systemConfig).execution.maxSingleOrderPctOfNav;
  if (!fullyAutonomousAgent) {
    const breachingProposal = findAutoExecuteSingleOrderBreach({
      totalEquity,
      maxSinglePct,
      proposals: input.cycle.proposals,
    });
    if (breachingProposal) {
      const message = breachingProposal.message;
      logSwallowed(`${input.triggerSource}.autoExecuteGate`, new Error(message));
      await notifyAutoExecutionIssue({
        systemConfig: input.systemConfig,
        eventType: "auto_execute_blocked",
        triggerSource: input.triggerSource,
        cycleId: input.cycle.cycleId,
        message: `[自动执行已阻止]\n周期 ${input.cycle.cycleId}\n${message}`,
        requestJson: { reason: "policy.execution.maxSingleOrderPctOfNav" },
      }).catch((err) => logSwallowed(`${input.triggerSource}.autoExecuteGateNotify`, err));
      return {
        ...base,
        blockedReason: message,
        authority,
      };
    }
  }

  if (!fullyAutonomousAgent) {
    const turnoverBreach = findAutoExecuteTurnoverBreach({
      totalEquity,
      maxTurnoverPct: input.systemConfig.strategy.constraints.maxOrderPctOfNav,
      proposals: input.cycle.proposals,
    });
    if (turnoverBreach) {
      const message = turnoverBreach.message;
      logSwallowed(`${input.triggerSource}.autoExecuteTurnoverGate`, new Error(message));
      await notifyAutoExecutionIssue({
        systemConfig: input.systemConfig,
        eventType: "auto_execute_blocked",
        triggerSource: input.triggerSource,
        cycleId: input.cycle.cycleId,
        message: `[自动执行已阻止]\n周期 ${input.cycle.cycleId}\n${message}`,
        requestJson: { reason: "maxOrderPctOfNav", totalNotional: turnoverBreach.totalNotional },
      }).catch((err) => logSwallowed(`${input.triggerSource}.autoExecuteTurnoverGateNotify`, err));
      return {
        ...base,
        blockedReason: message,
        authority,
      };
    }
  }

  if (!fullyAutonomousAgent) {
    const riskBreach = findAutoExecutionRiskBreach({
      riskCheck: input.cycle.riskCheck ?? null,
      proposals: input.cycle.proposals,
    });
    if (riskBreach) {
      logSwallowed(`${input.triggerSource}.autoExecuteRiskGate`, new Error(riskBreach));
      await notifyAutoExecutionIssue({
        systemConfig: input.systemConfig,
        eventType: "auto_execute_blocked",
        triggerSource: input.triggerSource,
        cycleId: input.cycle.cycleId,
        message: `[自动执行已阻止]\n周期 ${input.cycle.cycleId}\n${riskBreach}`,
        requestJson: { reason: "preTradeRiskCheck", riskStatus: input.cycle.riskCheck?.overallStatus ?? null },
      }).catch((err) => logSwallowed(`${input.triggerSource}.autoExecuteRiskGateNotify`, err));
      return {
        ...base,
        blockedReason: riskBreach,
        authority,
      };
    }
  }

  try {
    const execResult = await executeRebalanceViaGateway({
      cycleId: input.cycle.cycleId,
      executeMode: "selected",
      notifyMode: "fanout",
    });
    const executedCount = execResult.logs.filter((row) => (
      row.status === "executed" && row.cycleId === input.cycle.cycleId
    )).length;
    return {
      ...base,
      executed: executedCount > 0,
      ordersCount: executedCount,
      authority,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    logSwallowed(`${input.triggerSource}.autoExecute`, error);
    await notifyAutoExecutionIssue({
      systemConfig: input.systemConfig,
      eventType: "auto_execute_failed",
      triggerSource: input.triggerSource,
      cycleId: input.cycle.cycleId,
      message: `[自动执行失败] 周期 ${input.cycle.cycleId}\n原因: ${message}`,
      requestJson: { error: message },
    }).catch((err) => logSwallowed(`${input.triggerSource}.autoExecuteNotify`, err));
    return {
      ...base,
      error: message,
      authority,
    };
  }
}
