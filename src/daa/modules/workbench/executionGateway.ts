/**
 * 本地执行网关: trade / rebalance 执行 + 通知扇出.
 *
 * 合并自原 src/daa/gateway/localExecutionGateway.ts。
 */

import type { DaaBrokerBackedExecutionResult, DaaBrokerKind } from "./executionVenue";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { buildTradeExecutionNotifyText } from "@/src/daa/notify/tradeExecutionBuilder";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import {
  executeManualTrade,
  previewManualTrade,
  type ExecuteManualTradeInput,
  type PreviewManualTradeInput,
} from "./manualTradeService";
import type { RebalanceExecuteMode } from "./rebalanceExecuteMode";
import { executeWorkbenchRebalanceCycle } from "./workbenchRebalanceCycleService";
import type { ExecuteRebalanceCycleResult } from "./workbenchTypes";

type LocalExecutionGatewayNotifyMode = "fanout" | "silent";

type LocalExecutionGatewayStatus = {
  mode: "local";
  ready: true;
  label: string;
  summary: string;
  supportsRemoteBridge: false;
  venues: DaaBrokerKind[];
  capabilities: {
    previewTrade: true;
    executeTrade: true;
    executeRebalance: true;
    remoteOrderSync: false;
  };
};

const LOCAL_EXECUTION_GATEWAY_STATUS: LocalExecutionGatewayStatus = {
  mode: "local",
  ready: true,
  label: "本地执行网关",
  summary: "当前执行链路只承载本地 sim 与 crypto_paper。",
  supportsRemoteBridge: false,
  venues: ["sim", "crypto_paper"],
  capabilities: {
    previewTrade: true,
    executeTrade: true,
    executeRebalance: true,
    remoteOrderSync: false,
  },
};

function shouldNotifyTradeExecution(notification: Awaited<ReturnType<typeof getDaaSystemConfig>>["config"]["notification"]): boolean {
  return (notification.telegram.enabled && notification.telegram.onTradeExecuted)
    || (notification.feishu.enabled && notification.feishu.onTradeExecuted);
}

async function fanoutTradeExecutionNotification(execution: DaaBrokerBackedExecutionResult): Promise<void> {
  if (execution.result.status !== "executed") return;

  try {
    const systemRow = await getDaaSystemConfig();
    const notification = systemRow.config.notification;
    if (!shouldNotifyTradeExecution(notification)) return;

    const message = buildTradeExecutionNotifyText({
      source: execution.source === "decision" ? "decision_trade_execution" : "manual_trade_execution",
      baseCurrency: execution.baseCurrency,
      executeMode: "single",
      cycleId: execution.item.cycleId || null,
      ticketId: execution.item.ticketId,
      venueKind: execution.broker?.kind || execution.item.brokerKind || null,
      venueAccountId: execution.broker?.accountId || execution.item.brokerAccountId || null,
      executedCount: execution.summary.executed,
      failedCount: execution.summary.rejected,
      totalCount: execution.summary.total,
      totalNotional: execution.notionalInBase,
      logs: execution.logs.filter((row) => row.ticketId === execution.item.ticketId),
    });
    const meta = {
      eventType: "trade_executed",
      triggerSource: execution.source === "decision" ? "decision_trade_execution" : "manual_trade_execution",
      cycleId: execution.item.cycleId || null,
      ticketId: execution.item.ticketId,
      requestJson: {
        gatewayMode: LOCAL_EXECUTION_GATEWAY_STATUS.mode,
        status: execution.result.status,
        symbol: execution.symbol,
        side: execution.side,
        qty: execution.item.qty,
        notionalInBase: execution.notionalInBase,
        broker: execution.broker ? {
          kind: execution.broker.kind,
          accountId: execution.broker.accountId,
          remoteOrderId: execution.broker.remoteOrderId,
          remoteStatus: execution.broker.remoteStatus,
          routeReason: execution.broker.routeReason,
        } : null,
      },
    };
    await Promise.allSettled([
      notification.telegram.enabled && notification.telegram.onTradeExecuted ? sendTelegramByEnv(message, meta) : Promise.resolve(false),
      notification.feishu.enabled && notification.feishu.onTradeExecuted ? sendFeishuByEnv(message, meta) : Promise.resolve(false),
    ]);
  } catch (err) {
    logSwallowed("executionGateway.notify", err);
  }
}

async function fanoutRebalanceExecutionNotification(
  result: ExecuteRebalanceCycleResult,
  executeMode: RebalanceExecuteMode,
): Promise<void> {
  try {
    const systemRow = await getDaaSystemConfig();
    const notification = systemRow.config.notification;
    if (!shouldNotifyTradeExecution(notification)) return;

    const ticketIds = new Set(result.cycle.executedOrders || []);
    const cycleLogs = result.logs.filter((row) => ticketIds.has(row.ticketId));
    const executedCount = cycleLogs.filter((row) => row.status === "executed").length;
    const submittedCount = cycleLogs.filter((row) => row.status === "submitted" || row.status === "partially_filled").length;
    const failedCount = cycleLogs.filter((row) => row.status === "rejected" || row.status === "canceled").length;

    // 抑制 0 单推送：无任何订单时不发"成交 0/0/0"的噪声通知
    if (executedCount + submittedCount + failedCount === 0) return;
    const message = buildTradeExecutionNotifyText({
      source: "rebalance_cycle_execution",
      baseCurrency: systemRow.config.strategy.account.baseCurrency || "USD",
      executeMode,
      cycleId: result.cycle.cycleId,
      executedCount,
      submittedCount,
      failedCount,
      totalCount: cycleLogs.length,
      totalNotional: cycleLogs.reduce((sum, row) => sum + (row.qty * row.price), 0),
      logs: cycleLogs,
    });
    const meta = {
      eventType: "trade_executed",
      triggerSource: "rebalance_cycle_execution",
      cycleId: result.cycle.cycleId,
      requestJson: {
        gatewayMode: LOCAL_EXECUTION_GATEWAY_STATUS.mode,
        executeMode,
        ordersExecuted: executedCount,
        ordersSubmitted: submittedCount,
        ordersFailed: failedCount,
      },
    };
    await Promise.allSettled([
      notification.telegram.enabled && notification.telegram.onTradeExecuted ? sendTelegramByEnv(message, meta) : Promise.resolve(false),
      notification.feishu.enabled && notification.feishu.onTradeExecuted ? sendFeishuByEnv(message, meta) : Promise.resolve(false),
    ]);
  } catch (err) {
    logSwallowed("executionGateway.notify", err);
  }
}

export async function previewTradeViaGateway(input: PreviewManualTradeInput) {
  return previewManualTrade(input);
}

export async function executeTradeViaGateway(input: {
  request: ExecuteManualTradeInput;
  notifyMode?: LocalExecutionGatewayNotifyMode;
}) {
  const execution = await executeManualTrade(input.request);
  if (input.notifyMode !== "silent") {
    await fanoutTradeExecutionNotification(execution);
  }
  return execution;
}

export async function executeRebalanceViaGateway(input: {
  cycleId: string;
  executeMode: RebalanceExecuteMode;
  notifyMode?: LocalExecutionGatewayNotifyMode;
}) {
  const result = await executeWorkbenchRebalanceCycle({
    cycleId: input.cycleId,
    executeMode: input.executeMode,
  });
  if (input.notifyMode !== "silent") {
    await fanoutRebalanceExecutionNotification(result, input.executeMode);
  }
  return result;
}
