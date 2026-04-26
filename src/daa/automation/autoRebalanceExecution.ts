import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

import { findAutoExecuteSingleOrderBreach } from "./automationGuards";

export type AutoRebalanceExecutionResult = {
  attempted: boolean;
  executed: boolean;
  ordersCount: number;
  blockedReason: string | null;
  error: string | null;
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

export async function executeAutoRebalanceCycle(input: {
  cycle: Pick<RebalanceCycle, "cycleId" | "proposals">;
  systemConfig: DaaSystemConfig;
  triggerSource: string;
  totalEquity?: number | null;
}): Promise<AutoRebalanceExecutionResult> {
  const base: AutoRebalanceExecutionResult = {
    attempted: true,
    executed: false,
    ordersCount: 0,
    blockedReason: null,
    error: null,
  };

  if (!input.systemConfig.rebalanceStrategy.autoExecuteEnabled) {
    return {
      ...base,
      attempted: false,
      error: "自动执行未开启。",
    };
  }

  const totalEquity = input.totalEquity == null
    ? Math.max(0, (await buildWorkbenchBootstrap({ syncPrices: false })).account.totalEquity ?? 0)
    : Math.max(0, Number(input.totalEquity) || 0);
  const maxSinglePct = Math.max(0, input.systemConfig.rebalanceStrategy.autoExecuteMaxSinglePct ?? 10) / 100;
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
      requestJson: { reason: "autoExecuteMaxSinglePct" },
    }).catch((err) => logSwallowed(`${input.triggerSource}.autoExecuteGateNotify`, err));
    return {
      ...base,
      blockedReason: message,
    };
  }

  try {
    const execResult = await executeRebalanceViaGateway({
      cycleId: input.cycle.cycleId,
      executeMode: "all",
      notifyMode: "fanout",
    });
    const executedCount = execResult.logs.filter((row) => (
      row.status === "executed" && row.cycleId === input.cycle.cycleId
    )).length;
    return {
      ...base,
      executed: executedCount > 0,
      ordersCount: executedCount,
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
    };
  }
}
