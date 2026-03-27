import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

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

    if (!strategy.drift.enabled) {
      return ok({
        skipped: true,
        reason: "drift trigger disabled",
        at: new Date().toISOString(),
      });
    }

    // Always run bootstrap to detect drift (independent of autoGenerateEnabled)
    const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false, autoRiskCycle: true });

    // Detect drift: find assets exceeding threshold
    const driftThreshold = strategy.drift.thresholdPct;
    const driftedAssets = bootstrap.assetUniverse.filter(
      (a) => a.holdingQty > 0 && a.gapPct != null && Math.abs(a.gapPct) >= driftThreshold * 100,
    );
    const hasDrift = driftedAssets.length > 0;

    // Phase A: auto-generate rebalance cycle (gated by autoGenerateEnabled)
    let generated: {
      created: boolean;
      skippedByCooldown: boolean;
      cooldownUntil: string | null;
      message: string;
      cycle: { cycleId: string; triggerReason: string; proposals: unknown[]; riskCheck: { overallStatus: string } } | null;
    } | null = null;

    if (strategy.autoGenerateEnabled) {
      generated = await generateWorkbenchRebalanceCycle({
        triggerSource: "drift",
        triggerReason: "偏移量阈值触发",
        manual: false,
      });
    }

    const cycle = generated?.cycle ?? null;
    const notif = system.config.notification;

    // Phase B: drift notification (independent of autoGenerateEnabled)
    // Send if drift detected OR if a cycle was created
    try {
      if (hasDrift || (cycle && generated?.created)) {
        const topDrift = driftedAssets.slice(0, 5);
        const driftLines = topDrift.map(
          (a) => `${a.symbol}: gap ${a.gapPct != null ? a.gapPct.toFixed(1) : "?"}%`,
        );

        const msgParts = [
          "DAA 偏移触发通知",
          cycle ? `Cycle: ${cycle.cycleId}` : "未生成周期（自动生成已关闭）",
          `偏移标的: ${driftedAssets.length} 个`,
          ...driftLines,
        ];
        if (cycle) {
          msgParts.push(`建议数: ${cycle.proposals.length}`);
          msgParts.push(`风控: ${cycle.riskCheck.overallStatus}`);
        }
        const driftMsg = msgParts.join("\n");

        const sends: Promise<boolean>[] = [];
        if (notif.telegram.enabled && notif.telegram.onDriftTrigger) {
          sends.push(sendTelegramByEnv(driftMsg, {
            eventType: "drift_triggered",
            triggerSource: "cron_drift_check",
            cycleId: cycle?.cycleId || null,
            requestJson: {
              driftedAssetCount: driftedAssets.length,
              autoGenerateEnabled: strategy.autoGenerateEnabled,
            },
          }));
        }
        if (notif.feishu.enabled && notif.feishu.onDriftTrigger) {
          sends.push(sendFeishuByEnv(driftMsg, {
            eventType: "drift_triggered",
            triggerSource: "cron_drift_check",
            cycleId: cycle?.cycleId || null,
            requestJson: {
              driftedAssetCount: driftedAssets.length,
              autoGenerateEnabled: strategy.autoGenerateEnabled,
            },
          }));
        }
        await Promise.allSettled(sends);
      }
    } catch (err) {
  logSwallowed("driftCheckRoute.notify", err);
    }

    return ok({
      skipped: generated ? !generated.created : true,
      created: generated?.created ?? false,
      skippedByCooldown: generated?.skippedByCooldown ?? false,
      cooldownUntil: generated?.cooldownUntil ?? null,
      message: generated?.message ?? (hasDrift ? "drift detected but auto generate disabled" : "no drift detected"),
      cycleId: cycle?.cycleId || null,
      proposalCount: cycle?.proposals.length || 0,
      driftDetected: hasDrift,
      driftedAssetCount: driftedAssets.length,
      autoGenerateEnabled: strategy.autoGenerateEnabled,
      at: new Date().toISOString(),
    });
  });
}

