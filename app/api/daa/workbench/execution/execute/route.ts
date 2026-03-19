import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildTradeExecutionNotifyText } from "@/src/daa/notify/tradeExecutionBuilder";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { executeManualTrade, ManualTradeServiceError } from "@/src/daa/modules/workbench/manualTradeService";

export const runtime = "nodejs";

type Body = {
  source?: unknown;
  origin?: unknown;
  side?: unknown;
  assetKey?: unknown;
  cycleId?: unknown;
  symbol?: unknown;
  market?: unknown;
  currency?: unknown;
  qty?: unknown;
  price?: unknown;
  notionalInBase?: unknown;
  fee?: unknown;
  pricingMode?: unknown;
  priceSource?: unknown;
  priceSnapshotAt?: unknown;
  decisionRefId?: unknown;
  reasonTags?: unknown;
  reasonText?: unknown;
  createdBy?: unknown;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    let execution;
    try {
      execution = await executeManualTrade(body || {});
    } catch (error) {
      if (error instanceof ManualTradeServiceError) {
        return fail(error.code as never, error.message, {
          status: error.status,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      throw error;
    }

    try {
      const systemRow = await getDaaSystemConfig();
      const notification = systemRow.config.notification;
      if (
        (notification.telegram.enabled && notification.telegram.onTradeExecuted)
        || (notification.feishu.enabled && notification.feishu.onTradeExecuted)
      ) {
        const message = buildTradeExecutionNotifyText({
          source: execution.source === "decision" ? "decision_trade_execution" : "manual_trade_execution",
          baseCurrency: execution.baseCurrency,
          executeMode: "single",
          cycleId: execution.item.cycleId || null,
          ticketId: execution.item.ticketId,
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
            status: execution.result.status,
            symbol: execution.symbol,
            side: execution.side,
            qty: execution.item.qty,
            notionalInBase: execution.notionalInBase,
            broker: execution.broker ? {
              kind: execution.broker.kind,
              remoteOrderId: execution.broker.remoteOrderId,
              remoteStatus: execution.broker.remoteStatus,
            } : null,
          },
        };
        await Promise.allSettled([
          notification.telegram.enabled && notification.telegram.onTradeExecuted ? sendTelegramByEnv(message, meta) : Promise.resolve(false),
          notification.feishu.enabled && notification.feishu.onTradeExecuted ? sendFeishuByEnv(message, meta) : Promise.resolve(false),
        ]);
      }
    } catch {
      // 忽略通知失败，避免阻塞交易执行
    }

    return ok({
      item: execution.item,
      result: execution.result,
      summary: execution.summary,
      logs: execution.logs,
      broker: execution.broker,
    });
  });
}
