import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { executeAutoRebalanceCycle } from "@/src/daa/automation/autoRebalanceExecution";
import { runRiskAutopilotDaily } from "@/src/daa/automation/riskAutopilotTrigger";
import {
  buildAccountScopedRequestIdempotencyKey,
  buildUtcCronWindowIdempotencyKey,
  runForEachActiveDaaAccountScope,
  runIdempotentAccountScopedCronJob,
  summarizeAccountScopedCronRuns,
  unwrapSingleAccountCronResult,
} from "@/src/daa/cron/accountCronScope";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { buildDriftNotificationText, buildRiskTriggerNotificationText } from "@/src/daa/notify/telegramNotificationComposer";
import { getDaaSystemConfig, listDaaRebalanceCycles } from "@/src/daa/store/daaStorePg";
import { hasTodayNotification } from "@/src/daa/store/notificationDeliveryLogRepo";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";
import { collectRiskTriggerEvaluation, type RiskTriggerAsset } from "@/src/daa/modules/portfolio-state/positionPnl";
import { buildPositionMaterialityOptions } from "@/src/daa/modules/portfolio-state/positionMateriality";
import { buildPortfolioState } from "@/src/daa/modules/portfolio-state/portfolioStateService";
import { collectPortfolioSignals } from "@/src/daa/modules/signals/signalCollector";
import type { DriftSignal } from "@/src/daa/modules/signals/signalTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { formatAssetLabel } from "@/src/daa/assetRegistry";

export const runtime = "nodejs";

function cronAssetKey(asset: { assetKey?: string | null; market?: string | null; symbol?: string | null }): string {
  const symbol = String(asset.symbol || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
  const market = String(asset.market || "US").trim().toUpperCase() || "US";
  return String(asset.assetKey || `${market}::${symbol}`).trim().toUpperCase();
}

type RiskAutoExecuteSummary = {
  attempted: boolean;
  executed: boolean;
  ordersCount: number;
  cycleId: string | null;
  error?: string | null;
  blockedReason?: string | null;
};

const EMPTY_RISK_AUTO_EXECUTE: RiskAutoExecuteSummary = {
  attempted: false,
  executed: false,
  ordersCount: 0,
  cycleId: null,
};

function normalizeRiskMatchKey(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

async function executePendingRiskCycleForTriggers(input: {
  triggeredAssets: RiskTriggerAsset[];
  systemConfig: Awaited<ReturnType<typeof getDaaSystemConfig>>["config"];
  totalEquity: number | null | undefined;
}): Promise<RiskAutoExecuteSummary> {
  if (input.triggeredAssets.length === 0) return { ...EMPTY_RISK_AUTO_EXECUTE };

  const assetKeys = new Set(input.triggeredAssets.map((asset) => normalizeRiskMatchKey(asset.assetKey)).filter(Boolean));
  const symbols = new Set(input.triggeredAssets.map((asset) => normalizeRiskMatchKey(asset.symbol)).filter(Boolean));
  if (assetKeys.size === 0 && symbols.size === 0) return { ...EMPTY_RISK_AUTO_EXECUTE };

  const cycles = await listDaaRebalanceCycles(30).catch((err) => {
    logSwallowed("driftCheckRoute.riskAutoExecute.listCycles", err);
    return [];
  });
  const riskCycle = cycles.find((cycle) => {
    if (cycle.triggerSource !== "risk") return false;
    if (cycle.status !== "generated" && cycle.status !== "reviewing") return false;
    if (cycle.executedAt || cycle.cancelledAt) return false;
    return cycle.proposals.some((proposal) => {
      if (proposal.selected === false || proposal.side !== "SELL") return false;
      const assetKey = normalizeRiskMatchKey(proposal.assetKey);
      const symbol = normalizeRiskMatchKey(proposal.symbol);
      return assetKeys.has(assetKey) || symbols.has(symbol);
    });
  });
  if (!riskCycle) return { ...EMPTY_RISK_AUTO_EXECUTE };

  try {
    const result = await executeAutoRebalanceCycle({
      cycle: riskCycle,
      systemConfig: input.systemConfig,
      triggerSource: "risk",
      totalEquity: input.totalEquity,
    });
    return {
      attempted: result.attempted,
      executed: result.executed,
      ordersCount: result.ordersCount,
      cycleId: riskCycle.cycleId,
      error: result.error || null,
      blockedReason: result.blockedReason || null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || "");
    logSwallowed("driftCheckRoute.riskAutoExecute", err);
    return {
      attempted: true,
      executed: false,
      ordersCount: 0,
      cycleId: riskCycle.cycleId,
      error: message,
      blockedReason: message,
    };
  }
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const fallbackKey = buildUtcCronWindowIdempotencyKey("cron_drift_check", 60);
    const runs = await runForEachActiveDaaAccountScope((scope) =>
      runDriftCheckJob(req, buildAccountScopedRequestIdempotencyKey(scope, req, fallbackKey)),
    );
    const single = unwrapSingleAccountCronResult(runs);
    return ok(single ?? summarizeAccountScopedCronRuns(runs));
  });
}

async function runDriftCheckJob(req: Request, idempotencyKey: string | null): Promise<Record<string, unknown>> {
    return runIdempotentAccountScopedCronJob({
      req,
      jobType: "cron_drift_check",
      triggerSource: "cron_drift_check",
      idempotencyKey,
      duplicateReason: "当前账号同一 drift-check 幂等任务已完成，跳过重复触发。",
      summarize: (r) => {
        const result = r as Record<string, unknown>;
        return { created: result.created, driftedAssetCount: result.driftedAssetCount, riskTriggeredCount: result.riskTriggeredCount };
      },
      handler: async () => runDriftCheck(req),
    });
}

async function runDriftCheck(req: Request) {
    const system = await getDaaSystemConfig();
    const policy = resolvePolicyConfig(system.config);

    if (!policy.drift.enabled) {
      return {
        skipped: true,
        reason: "drift policy disabled",
        at: new Date().toISOString(),
      };
    }

    // Always run bootstrap to detect drift (independent of autoGenerateEnabled)
    const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false, autoRiskCycle: true });
    const portfolioState = buildPortfolioState(bootstrap);
    const signals = collectPortfolioSignals({
      portfolioState,
      systemConfig: system.config,
      policy,
      marketContext: bootstrap.marketContext,
    });

    // Detect drift as a signal. It no longer直接等于交易触发，只表示进入 no-trade band 外圈。
    const driftThreshold = policy.drift.outerBandPct;
    const driftSignals = signals.filter(
      (signal): signal is DriftSignal => signal.type === "drift" && signal.enteredOuterBand,
    );
    const assetByKey = new Map(bootstrap.assetUniverse.map((asset) => [cronAssetKey(asset), asset]));
    const driftedAssets = driftSignals.map((signal) => {
      const asset = assetByKey.get(signal.assetKey.toUpperCase());
      return {
        assetKey: signal.assetKey,
        symbol: signal.symbol,
        gapPct: signal.driftPct,
        actualWeightPct: asset?.actualWeightPct ?? signal.actualWeightPct,
        targetWeightPct: asset?.targetWeightPct ?? signal.targetWeightPct,
      };
    });
    const hasDrift = driftedAssets.length > 0;

    // Phase A: auto-generate rebalance cycle (gated by policy execution)
    let generated: {
      created: boolean;
      skippedByCooldown: boolean;
      cooldownUntil: string | null;
      message: string;
      cycle: RebalanceCycle | null;
    } | null = null;

    if (policy.enabled && policy.execution.autoGenerateEnabled && hasDrift) {
      generated = await generateWorkbenchRebalanceCycle({
        triggerSource: "drift",
        triggerReason: "偏移量阈值触发",
        manual: false,
      });
    }

    const cycle = generated?.cycle ?? null;
    const newlyCreatedCycle = generated?.created === true ? cycle : null;
    const referenceCycle = generated?.created === false ? cycle : null;
    const notif = system.config.notification;

    // Phase B: drift notification.
    // 只有偏移产生新调仓周期时即时推送；纯观察类偏移折叠进每日复核/投资助理简报。
    let driftTriggerNotified = false;
    let driftTriggerSkippedReason: string | null = null;
    try {
      if (hasDrift && !newlyCreatedCycle) {
        driftTriggerSkippedReason = "drift notification folded into daily review";
      } else if (newlyCreatedCycle) {
        const topDrift = driftedAssets.slice(0, 5);
        const driftLines = topDrift.map(
          (a) => `${formatAssetLabel({ symbol: a.symbol, assetKey: a.assetKey })}: gap ${a.gapPct != null ? a.gapPct.toFixed(1) : "?"}%`,
        );

        const driftMsg = buildDriftNotificationText({
          newCycleCreated: true,
          cycleId: newlyCreatedCycle.cycleId,
          reason: "偏移量阈值触发",
          driftedAssetCount: driftedAssets.length,
          driftLines,
          proposalCount: newlyCreatedCycle.proposals.length,
          riskStatus: newlyCreatedCycle.riskCheck.overallStatus,
          source: "drift-check",
        });

        const sends: Promise<boolean>[] = [];
        if (notif.telegram.enabled && notif.telegram.onDriftTrigger) {
          sends.push(sendTelegramByEnv(driftMsg, {
            eventType: "drift_triggered",
            triggerSource: "cron_drift_check",
            cycleId: newlyCreatedCycle.cycleId,
            parseMode: null,
            requestJson: {
              notificationKind: "review_required",
              category: "rebalance",
              severity: "actionable",
              driftedAssetCount: driftedAssets.length,
              autoGenerateEnabled: policy.execution.autoGenerateEnabled,
              driftThresholdPct: driftThreshold,
              newCycleCreated: true,
              referenceCycleId: referenceCycle?.cycleId || null,
              generationMessage: generated?.message ?? null,
              policyOuterBandPct: policy.drift.outerBandPct,
              signalCount: signals.length,
            },
          }));
        }
        if (notif.feishu.enabled && notif.feishu.onDriftTrigger) {
          sends.push(sendFeishuByEnv(driftMsg, {
            eventType: "drift_triggered",
            triggerSource: "cron_drift_check",
            cycleId: newlyCreatedCycle.cycleId,
            requestJson: {
              notificationKind: "review_required",
              category: "rebalance",
              severity: "actionable",
              driftedAssetCount: driftedAssets.length,
              autoGenerateEnabled: policy.execution.autoGenerateEnabled,
              driftThresholdPct: driftThreshold,
              newCycleCreated: true,
              referenceCycleId: referenceCycle?.cycleId || null,
              generationMessage: generated?.message ?? null,
              policyOuterBandPct: policy.drift.outerBandPct,
              signalCount: signals.length,
            },
          }));
        }
        await Promise.allSettled(sends);
        driftTriggerNotified = sends.length > 0;
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
    const riskMateriality = buildPositionMaterialityOptions({
      minNotionalBase: system.config.strategy?.constraints?.minNotional ?? 0,
    });
    const riskEvaluation = collectRiskTriggerEvaluation({
      rows: bootstrap.assetUniverse,
      perAssetStopLossPct: riskConfig?.perAssetStopLossPct ?? 0,
      perAssetTakeProfitPct: riskConfig?.perAssetTakeProfitPct ?? 0,
      materiality: riskMateriality,
    });
    const riskTriggeredAssets = riskEvaluation.triggeredAssets;
    const riskIgnoredAssets = riskEvaluation.ignoredAssets;

    let riskAgentReview: {
      attempted: boolean;
      skipped: boolean;
      reason: string | null;
      runId: string | null;
      cycleId: string | null;
      proposalCount: number;
      error?: string | null;
    } = {
      attempted: false,
      skipped: true,
      reason: "no actionable risk triggers",
      runId: null,
      cycleId: null,
      proposalCount: 0,
    };
    let riskAutoExecute: RiskAutoExecuteSummary = { ...EMPTY_RISK_AUTO_EXECUTE };

    // 止损/止盈通知
    let riskTriggerNotified = false;
    let riskTriggerSkippedReason: string | null = null;
    if (riskTriggeredAssets.length > 0) {
      const stopLossCount = riskTriggeredAssets.filter(
        (a) => a.triggerType === "stop_loss",
      ).length;
      const takeProfitCount = riskTriggeredAssets.filter(
        (a) => a.triggerType === "take_profit",
      ).length;

      riskAutoExecute = await executePendingRiskCycleForTriggers({
        triggeredAssets: riskTriggeredAssets,
        systemConfig: system.config,
        totalEquity: bootstrap.account.totalEquity,
      });

      try {
        const review = await runRiskAutopilotDaily({
          req,
          source: "cron_drift_check",
          reason: "止盈止损触发即时审核",
          triggers: riskTriggeredAssets.map((asset) => ({
            symbol: asset.symbol,
            triggerType: asset.triggerType,
          })),
        });
        riskAgentReview = {
          attempted: true,
          skipped: review.skipped,
          reason: review.reason,
          runId: review.runId,
          cycleId: review.cycleId,
          proposalCount: review.proposalCount,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err || "");
        logSwallowed("driftCheckRoute.riskAgentReview", err);
        riskAgentReview = {
          attempted: true,
          skipped: true,
          reason: "risk agent review failed",
          runId: null,
          cycleId: null,
          proposalCount: 0,
          error: message,
        };
      }

      const riskMsg = buildRiskTriggerNotificationText({
        stopLossCount,
        takeProfitCount,
        ignoredCount: riskIgnoredAssets.length,
        assets: riskTriggeredAssets.slice(0, 8).map((asset) => ({
          label: formatAssetLabel({ symbol: asset.symbol, assetKey: asset.assetKey }),
          triggerType: asset.triggerType,
          pnlPct: asset.pnlPct,
        })),
        agentReview: riskAgentReview,
        riskAutoExecute,
        source: "drift-check",
      });

      try {
        if (await hasTodayNotification("risk_triggered")) {
          riskTriggerSkippedReason = "risk_triggered already delivered today";
        } else {
          const sends: Promise<boolean>[] = [];
          if (notif.telegram.enabled && notif.telegram.onRiskTriggered) {
            sends.push(
              sendTelegramByEnv(riskMsg, {
                eventType: "risk_triggered",
                triggerSource: "cron_drift_check",
                cycleId: riskAgentReview.cycleId,
                parseMode: null,
                requestJson: {
                  notificationKind: "risk_alert",
                  category: "risk",
                  severity: "critical",
                  stopLossCount,
                  takeProfitCount,
                  assets: riskTriggeredAssets.slice(0, 8),
                  ignoredCount: riskIgnoredAssets.length,
                  materiality: riskMateriality,
                  agentReview: riskAgentReview,
                  riskAutoExecute,
                },
              }),
            );
          }
          if (notif.feishu.enabled && notif.feishu.onRiskTriggered) {
            sends.push(
              sendFeishuByEnv(riskMsg, {
                eventType: "risk_triggered",
                triggerSource: "cron_drift_check",
                cycleId: riskAgentReview.cycleId,
                requestJson: {
                  notificationKind: "risk_alert",
                  category: "risk",
                  severity: "critical",
                  stopLossCount,
                  takeProfitCount,
                  assets: riskTriggeredAssets.slice(0, 8),
                  ignoredCount: riskIgnoredAssets.length,
                  materiality: riskMateriality,
                  agentReview: riskAgentReview,
                  riskAutoExecute,
                },
              }),
            );
          }
          await Promise.allSettled(sends);
          riskTriggerNotified = sends.length > 0;
        }
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
      cycleId: newlyCreatedCycle?.cycleId || null,
      referenceCycleId: referenceCycle?.cycleId || null,
      proposalCount: newlyCreatedCycle?.proposals.length || 0,
      driftDetected: hasDrift,
      driftedAssetCount: driftedAssets.length,
      driftTriggerNotified,
      driftTriggerSkippedReason,
      autoGenerateEnabled: policy.execution.autoGenerateEnabled,
      autoExecute,
      riskTriggeredCount: riskTriggeredAssets.length,
      riskIgnoredCount: riskIgnoredAssets.length,
      riskTriggerNotified,
      riskTriggerSkippedReason,
      riskAgentReview,
      riskAutoExecute,
      at: new Date().toISOString(),
    };
}
