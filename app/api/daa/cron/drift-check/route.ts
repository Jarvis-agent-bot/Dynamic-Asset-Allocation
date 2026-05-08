import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { executeAutoRebalanceCycle } from "@/src/daa/automation/autoRebalanceExecution";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { hasTodayNotification } from "@/src/daa/store/notificationDeliveryLogRepo";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { formatAssetLabel } from "@/src/daa/assetRegistry";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const execution = await runLoggedJob({
      req,
      jobType: "cron_drift_check",
      triggerSource: "cron_drift_check",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (r) => {
        const result = r as Record<string, unknown>;
        return { created: result.created, driftedAssetCount: result.driftedAssetCount, riskTriggeredCount: result.riskTriggeredCount };
      },
      handler: async () => runDriftCheck(),
    });

    return ok({
      ...(execution.result as Record<string, unknown>),
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}

async function runDriftCheck() {
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

    // Detect drift: find assets exceeding the configured threshold.
    const driftThreshold = strategy.drift.thresholdPct;
    const driftedAssets = bootstrap.assetUniverse.filter((a) => {
      if (a.holdingQty <= 0 || a.gapPct == null) return false;
      return Math.abs(a.gapPct) >= driftThreshold * 100;
    });
    const hasDrift = driftedAssets.length > 0;

    // Phase A: auto-generate rebalance cycle (gated by autoGenerateEnabled)
    let generated: {
      created: boolean;
      skippedByCooldown: boolean;
      cooldownUntil: string | null;
      message: string;
      cycle: RebalanceCycle | null;
    } | null = null;

    if (strategy.autoGenerateEnabled) {
      const hasWatchlistEntryPath = system.config.watchlistEntry?.enabled === true;
      if (hasDrift || hasWatchlistEntryPath) {
        generated = await generateWorkbenchRebalanceCycle({
          triggerSource: "drift",
          triggerReason: hasDrift ? "偏移量阈值触发" : "观察列表自动建仓检查",
          manual: false,
        });
      }
    }

    const cycle = generated?.cycle ?? null;
    const notif = system.config.notification;

    // Phase B: drift notification (independent of autoGenerateEnabled).
    // 漂移持续存在时，cron 一天会进来多次；同类通知当天成功投递后不再重复刷屏。
    let driftTriggerNotified = false;
    let driftTriggerSkippedReason: string | null = null;
    try {
      const shouldNotifyTrigger = hasDrift || (cycle && generated?.created);
      if (shouldNotifyTrigger) {
        const isRepeatedDriftReminder = hasDrift && generated?.created !== true;
        if (isRepeatedDriftReminder && await hasTodayNotification("drift_triggered")) {
          driftTriggerSkippedReason = "drift_triggered already delivered today";
        } else {
          const topDrift = driftedAssets.slice(0, 5);
          const driftLines = topDrift.map(
            (a) => `${formatAssetLabel({ symbol: a.symbol, assetKey: a.assetKey })}: gap ${a.gapPct != null ? a.gapPct.toFixed(1) : "?"}%`,
          );

          const msgParts = [
            hasDrift ? "DAA 偏移触发通知" : "DAA 自动调仓触发通知",
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
          driftTriggerNotified = sends.length > 0;
        }
      }
    } catch (err) {
      logSwallowed("driftCheckRoute.notify", err);
    }

    // ── Phase C: auto-execute（统一交给 AutomationAuthority 判定） ──
    let autoExecute: { attempted: boolean; executed: boolean; ordersCount: number; error?: string; blockedReason?: string | null } = {
      attempted: false,
      executed: false,
      ordersCount: 0,
    };

    if (generated?.created && cycle) {
      const result = await executeAutoRebalanceCycle({
        cycle,
        systemConfig: system.config,
        triggerSource: "cron_drift_check",
        totalEquity: bootstrap.account.totalEquity,
      });
      autoExecute = {
        attempted: result.attempted,
        executed: result.executed,
        ordersCount: result.ordersCount,
        error: result.error || result.blockedReason || undefined,
        blockedReason: result.blockedReason,
      };
    }

    // ── Phase D: 止损/止盈自动检测 ──
    const riskConfig = system.config.strategy?.risk;
    const stopLossPct = riskConfig?.perAssetStopLossPct ?? 0;
    const takeProfitPct = riskConfig?.perAssetTakeProfitPct ?? 0;
    const riskTriggeredAssets: Array<{
      assetKey: string;
      symbol: string;
      pnlPct: number;
      triggerType: "stop_loss" | "take_profit";
    }> = [];

    if (stopLossPct > 0 || takeProfitPct > 0) {
      for (const asset of bootstrap.assetUniverse) {
        if (asset.holdingQty <= 0) continue;
        // 优先使用基准货币的 PnL（含 FX 转换），避免跨货币误判
        const unrealizedPnlPct = asset.unrealizedPnlPct
          ?? (asset.costBasisInBase && asset.costBasisInBase > 0 && asset.valuationBase
            ? ((asset.valuationBase - asset.costBasisInBase) / asset.costBasisInBase) * 100
            : null);
        if (unrealizedPnlPct == null) continue;

        if (stopLossPct > 0 && unrealizedPnlPct < -(stopLossPct * 100)) {
          riskTriggeredAssets.push({
            assetKey: asset.assetKey,
            symbol: asset.symbol,
            pnlPct: unrealizedPnlPct,
            triggerType: "stop_loss",
          });
        }
        if (takeProfitPct > 0 && unrealizedPnlPct > takeProfitPct * 100) {
          riskTriggeredAssets.push({
            assetKey: asset.assetKey,
            symbol: asset.symbol,
            pnlPct: unrealizedPnlPct,
            triggerType: "take_profit",
          });
        }
      }
    }

    // 止损/止盈通知
    let riskTriggerNotified = false;
    if (riskTriggeredAssets.length > 0) {
      const stopLossCount = riskTriggeredAssets.filter(
        (a) => a.triggerType === "stop_loss",
      ).length;
      const takeProfitCount = riskTriggeredAssets.filter(
        (a) => a.triggerType === "take_profit",
      ).length;

      const riskLines = riskTriggeredAssets.slice(0, 8).map(
        (a) =>
          `${formatAssetLabel({ symbol: a.symbol, assetKey: a.assetKey })}: ${a.triggerType === "stop_loss" ? "止损" : "止盈"} ${a.pnlPct.toFixed(1)}%`,
      );
      const riskMsg = [
        "DAA 风控触发通知",
        `止损触发: ${stopLossCount} 项，止盈触发: ${takeProfitCount} 项`,
        ...riskLines,
      ].join("\n");

      try {
        const sends: Promise<boolean>[] = [];
        if (notif.telegram.enabled && notif.telegram.onDriftTrigger) {
          sends.push(
            sendTelegramByEnv(riskMsg, {
              eventType: "risk_triggered",
              triggerSource: "cron_drift_check",
              cycleId: null,
              requestJson: {
                stopLossCount,
                takeProfitCount,
                assets: riskTriggeredAssets.slice(0, 8),
              },
            }),
          );
        }
        if (notif.feishu.enabled && notif.feishu.onDriftTrigger) {
          sends.push(
            sendFeishuByEnv(riskMsg, {
              eventType: "risk_triggered",
              triggerSource: "cron_drift_check",
              cycleId: null,
              requestJson: {
                stopLossCount,
                takeProfitCount,
                assets: riskTriggeredAssets.slice(0, 8),
              },
            }),
          );
        }
        await Promise.allSettled(sends);
        riskTriggerNotified = sends.length > 0;
      } catch (err) {
        logSwallowed("driftCheckRoute.riskNotify", err);
      }
    }

    return {
      skipped: generated ? !generated.created : true,
      created: generated?.created ?? false,
      skippedByCooldown: generated?.skippedByCooldown ?? false,
      cooldownUntil: generated?.cooldownUntil ?? null,
      message: generated?.message ?? (hasDrift ? "drift detected but auto generate disabled" : "no drift detected"),
      cycleId: cycle?.cycleId || null,
      proposalCount: cycle?.proposals.length || 0,
      driftDetected: hasDrift,
      driftedAssetCount: driftedAssets.length,
      driftTriggerNotified,
      driftTriggerSkippedReason,
      autoGenerateEnabled: strategy.autoGenerateEnabled,
      autoExecute,
      riskTriggeredCount: riskTriggeredAssets.length,
      riskTriggerNotified,
      at: new Date().toISOString(),
    };
}
