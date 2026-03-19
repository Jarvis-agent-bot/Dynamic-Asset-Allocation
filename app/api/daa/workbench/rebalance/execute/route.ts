import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { WorkbenchDomainError } from "@/src/daa/modules/workbench/workbenchErrors";
import { executeWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import { buildTradeExecutionNotifyText } from "@/src/daa/notify/tradeExecutionBuilder";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

type Body = {
  cycleId?: unknown;
  executeMode?: unknown;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const payload = (body || {}) as Body;
    const cycleId = String(payload.cycleId || "").trim();
    if (!cycleId) {
      return fail("VALIDATION_FAILED", "cycleId is required", { status: 400 });
    }
    const executeMode = String(payload.executeMode || "").trim().toLowerCase() === "selected" ? "selected" : "all";
    let data;
    try {
      data = await executeWorkbenchRebalanceCycle({ cycleId, executeMode });
    } catch (error) {
      if (error instanceof WorkbenchDomainError) {
        return fail("VALIDATION_FAILED", error.message, {
          status: error.status,
          details: {
            code: error.code,
            ...(error.details || {}),
          },
        });
      }
      const message = error instanceof Error ? error.message : String(error || "");
      if (message.startsWith("RISK_BLOCKED:")) {
        const raw = message.slice("RISK_BLOCKED:".length).trim();
        let details: Record<string, unknown> = {
          code: "RISK_BLOCKED",
          rule: "unknown",
          current: null,
          limit: null,
        };
        let reason = "执行前风控阻断";
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          reason = String(parsed.message || reason);
          details = {
            code: String(parsed.code || "RISK_BLOCKED"),
            rule: String(parsed.rule || "unknown"),
            current: parsed.current ?? null,
            limit: parsed.limit ?? null,
          };
        } catch {
          reason = raw || reason;
        }
        return fail("VALIDATION_FAILED", reason, { status: 409, details });
      }
      throw error;
    }

    try {
      const system = await getDaaSystemConfig();
      const notification = system.config.notification;
      if (
        (notification.telegram.enabled && notification.telegram.onTradeExecuted)
        || (notification.feishu.enabled && notification.feishu.onTradeExecuted)
      ) {
        const ticketIds = new Set(data.cycle.executedOrders || []);
        const cycleLogs = data.logs.filter((row) => ticketIds.has(row.ticketId));
        const executedCount = cycleLogs.filter((row) => row.status === "executed").length;
        const failedCount = cycleLogs.filter((row) => row.status !== "executed").length;
        const message = buildTradeExecutionNotifyText({
          source: "rebalance_cycle_execution",
          baseCurrency: system.config.strategy.account.baseCurrency || "USD",
          executeMode,
          cycleId,
          executedCount,
          failedCount,
          totalCount: cycleLogs.length,
          totalNotional: data.cycle.executionSummary?.totalNotional ?? cycleLogs.reduce((sum, row) => sum + (row.qty * row.price), 0),
          logs: cycleLogs,
        });
        const meta = {
          eventType: "trade_executed",
          triggerSource: "rebalance_cycle_execution",
          cycleId,
          requestJson: {
            executeMode,
            ordersExecuted: data.cycle.executionSummary?.ordersExecuted ?? executedCount,
            ordersFailed: data.cycle.executionSummary?.ordersFailed ?? failedCount,
          },
        };
        await Promise.allSettled([
          notification.telegram.enabled && notification.telegram.onTradeExecuted ? sendTelegramByEnv(message, meta) : Promise.resolve(false),
          notification.feishu.enabled && notification.feishu.onTradeExecuted ? sendFeishuByEnv(message, meta) : Promise.resolve(false),
        ]);
      }
    } catch {
      // 通知异常不阻塞主执行流
    }

    return ok(data);
  });
}
