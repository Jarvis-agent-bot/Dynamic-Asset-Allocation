import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { sendTelegramByEnvV1 } from "@/src/daa/notify/telegramV1";
import { confirmDaaRebalanceExecutionV1, getDaaNotificationConfigV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

type ConfirmRequestBodyV1 = {
  decisionId?: unknown;
  orders?: unknown;
  cash?: unknown;
};

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<ConfirmRequestBodyV1>(req);
    const decisionId = String(body?.decisionId || "").trim();
    const orders = Array.isArray(body?.orders) ? body.orders : null;
    const cash = Number(body?.cash || 0);

    if (!decisionId) {
      return failV1("VALIDATION_FAILED", "decisionId is required", { status: 400 });
    }
    if (!orders) {
      return failV1("VALIDATION_FAILED", "orders must be an array", { status: 400 });
    }

    const result = await confirmDaaRebalanceExecutionV1({ decisionId, orders: orders as any[], cash });

    try {
      const notifyConfig = await getDaaNotificationConfigV1();
      if (notifyConfig.enabled && notifyConfig.notifyOnRebalance) {
        const executedCount = result.orders.filter((x) => x.status === "executed" || x.status === "partial").length;
        await sendTelegramByEnvV1(
          [
            "*DAA 执行回填完成*",
            `Decision: ${result.decision.id}`,
            `状态: ${result.decision.status}`,
            `已处理订单: ${executedCount}/${result.orders.length}`,
            `权益: ${result.equitySnapshot.totalEquity.toFixed(2)}`,
          ].join("\n"),
        );
      }
    } catch {
      // 通知失败不阻塞主流程
    }

    return okV1(result);
  });
}
