import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
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

    // ── Phase C: auto-execute (gated by autoExecuteEnabled) ──
    let autoExecute: { attempted: boolean; executed: boolean; ordersCount: number; error?: string } = {
      attempted: false,
      executed: false,
      ordersCount: 0,
    };

    if (
      strategy.autoExecuteEnabled &&
      strategy.autoGenerateEnabled &&
      generated?.created &&
      cycle
    ) {
      autoExecute.attempted = true;
      try {
        const execResult = await executeRebalanceViaGateway({
          cycleId: cycle.cycleId,
          executeMode: "all",
          notifyMode: "fanout",
        });
        const executedCount = execResult.logs.filter((l) => l.status === "executed").length;
        autoExecute.executed = executedCount > 0;
        autoExecute.ordersCount = executedCount;
      } catch (err) {
        autoExecute.error = err instanceof Error ? err.message : String(err);
        logSwallowed("driftCheckRoute.autoExecute", err);
        const failMsg = `[自动执行失败] 漂移触发周期 ${cycle.cycleId}\n原因: ${autoExecute.error}`;
        try {
          const sends: Promise<boolean>[] = [];
          if (notif.telegram.enabled && notif.telegram.onTradeExecuted) {
            sends.push(sendTelegramByEnv(failMsg, {
              eventType: "auto_execute_failed",
              triggerSource: "cron_drift_check",
              cycleId: cycle.cycleId,
              requestJson: { error: autoExecute.error },
            }));
          }
          if (notif.feishu.enabled && notif.feishu.onTradeExecuted) {
            sends.push(sendFeishuByEnv(failMsg, {
              eventType: "auto_execute_failed",
              triggerSource: "cron_drift_check",
              cycleId: cycle.cycleId,
              requestJson: { error: autoExecute.error },
            }));
          }
          await Promise.allSettled(sends);
        } catch (notifyErr) {
          logSwallowed("driftCheckRoute.autoExecuteNotify", notifyErr);
        }
      }
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
          `${a.symbol}: ${a.triggerType === "stop_loss" ? "止损" : "止盈"} ${a.pnlPct.toFixed(1)}%`,
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
      autoGenerateEnabled: strategy.autoGenerateEnabled,
      autoExecute,
      riskTriggeredCount: riskTriggeredAssets.length,
      riskTriggerNotified,
      at: new Date().toISOString(),
    };
}

