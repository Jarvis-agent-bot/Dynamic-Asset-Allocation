import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const system = await getDaaSystemConfig();
    const strategy = system.config.rebalanceStrategy;
    if (!strategy.autoGenerateEnabled) {
      return ok({
        skipped: true,
        reason: "auto generate disabled",
        at: new Date().toISOString(),
      });
    }

    if (!strategy.drift.enabled) {
      return ok({
        skipped: true,
        reason: "drift trigger disabled",
        at: new Date().toISOString(),
      });
    }

    await buildWorkbenchBootstrap({ syncPrices: false, autoRiskCycle: true });

    const generated = await generateWorkbenchRebalanceCycle({
      triggerSource: "drift",
      triggerReason: "偏移量阈值触发",
      manual: false,
    });

    const cycle = generated.cycle;
    try {
      if (cycle && generated.created) {
        const driftMsg = [
          "DAA 偏移触发再平衡",
          `Cycle: ${cycle.cycleId}`,
          `原因: ${cycle.triggerReason}`,
          `建议数: ${cycle.proposals.length}`,
          `风控: ${cycle.riskCheck.overallStatus}`,
        ].join("\n");

        const notif = system.config.notification;
        const sends: Promise<boolean>[] = [];
        if (notif.telegram.enabled && notif.telegram.onDriftTrigger) {
          sends.push(sendTelegramByEnv(`*${driftMsg.replace(/\n/g, "*\n")}*`));
        }
        if (notif.feishu.enabled && notif.feishu.onDriftTrigger) {
          sends.push(sendFeishuByEnv(driftMsg));
        }
        await Promise.allSettled(sends);
      }
    } catch {
      // 通知失败不阻塞主流程
    }

    return ok({
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
