import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import { buildUnifiedRequestFromStoreV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { sendTelegramByEnvV1 } from "@/src/daa/notify/telegramV1";
import {
  createDaaRebalanceDecisionV1,
  getDaaNotificationConfigV1,
} from "@/src/daa/store/daaStorePgV1";
import { buildDaaUnifiedPlanV1 } from "@/src/daa/unifiedRebalanceV1";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const { request } = await buildUnifiedRequestFromStoreV1();
    const hydrated = await hydrateUnifiedRequestWithSignalsV1(request);
    const plan = buildDaaUnifiedPlanV1(hydrated.request);

    const created = await createDaaRebalanceDecisionV1({
      requestJson: hydrated.request as unknown as Record<string, unknown>,
      responseJson: {
        ...plan,
        hydrationDiagnostics: hydrated.diagnostics,
      } as unknown as Record<string, unknown>,
      shouldRebalance: Boolean(plan.summary.shouldRebalance),
      triggerSource: "cron_drift",
    });

    try {
      const notifyConfig = await getDaaNotificationConfigV1();
      if (notifyConfig.enabled && notifyConfig.notifyOnDrift && plan.summary.shouldRebalance) {
        await sendTelegramByEnvV1(
          [
            "*DAA 漂移检查触发再平衡*",
            `Decision: ${created.decision.id}`,
            `可执行订单: ${plan.summary.executableOrderCount}`,
            `阻断订单: ${plan.summary.blockedOrderCount}`,
            `阈值: ${(plan.summary.triggerThresholdPct * 100).toFixed(2)}%`,
          ].join("\n"),
        );
      }
    } catch {
      // 通知失败不阻塞主流程
    }

    return okV1({
      decisionId: created.decision.id,
      shouldRebalance: plan.summary.shouldRebalance,
      executableOrderCount: plan.summary.executableOrderCount,
      blockedOrderCount: plan.summary.blockedOrderCount,
      generatedAt: plan.generatedAt,
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
