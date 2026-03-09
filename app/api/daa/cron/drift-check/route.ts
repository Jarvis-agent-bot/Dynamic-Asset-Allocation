import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { buildWorkbenchBootstrapV1, generateWorkbenchRebalanceCycleV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { sendTelegramByEnvV1 } from "@/src/daa/notify/telegramV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const system = await getDaaSystemConfigV2();
    const strategy = system.config.rebalanceStrategy;
    if (!strategy.autoGenerateEnabled) {
      return okV1({
        skipped: true,
        reason: "auto generate disabled",
        at: new Date().toISOString(),
      });
    }

    if (!strategy.drift.enabled) {
      return okV1({
        skipped: true,
        reason: "drift trigger disabled",
        at: new Date().toISOString(),
      });
    }

    await buildWorkbenchBootstrapV1({ syncPrices: false, autoRiskCycle: true });

    const generated = await generateWorkbenchRebalanceCycleV1({
      triggerSource: "drift",
      triggerReason: "偏移量阈值触发",
      manual: false,
    });

    const cycle = generated.cycle;
    try {
      if (
        cycle
        && generated.created
        && system.config.notification.telegram.enabled
        && system.config.notification.telegram.onDriftTrigger
      ) {
        await sendTelegramByEnvV1(
          [
            "*DAA 偏移触发再平衡*",
            `Cycle: ${cycle.cycleId}`,
            `原因: ${cycle.triggerReason}`,
            `建议数: ${cycle.proposals.length}`,
            `风控: ${cycle.riskCheck.overallStatus}`,
          ].join("\n"),
        );
      }
    } catch {
      // 通知失败不阻塞主流程
    }

    return okV1({
      skipped: !generated.created,
      created: generated.created,
      skippedByCooldown: generated.skippedByCooldown,
      cooldownUntil: generated.cooldownUntil,
      message: generated.message,
      cycleId: cycle?.cycleId || null,
      proposalCount: cycle?.proposals.length || 0,
      at: new Date().toISOString(),
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
