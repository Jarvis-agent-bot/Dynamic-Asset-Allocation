import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { executeAutoRebalanceCycle } from "@/src/daa/automation/autoRebalanceExecution";
import {
  buildAccountScopedRequestIdempotencyKey,
  buildUtcCronWindowIdempotencyKey,
  runForEachActiveDaaAccountScope,
  runIdempotentAccountScopedCronJob,
  summarizeAccountScopedCronRuns,
  unwrapSingleAccountCronResult,
} from "@/src/daa/cron/accountCronScope";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { refreshMarketIndicators } from "@/src/daa/modules/marketContext/marketIndicatorService";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { buildDailyReviewText, DAILY_REVIEW_PARSE_MODE } from "@/src/daa/notify/dailyReviewBuilder";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { buildRebalanceSuggestionNotificationText } from "@/src/daa/notify/telegramNotificationComposer";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { hasTodayNotification } from "@/src/daa/store/notificationDeliveryLogRepo";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

function resolveScheduledHourUtc(config: {
  policy?: { review?: { scheduledTimeUtc?: unknown } };
}): number {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(config.policy?.review?.scheduledTimeUtc || "").trim());
  if (matched) {
    const hour = Number(matched[1]);
    const minute = Number(matched[2]);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return minute > 0 ? (hour + 1) % 24 : hour;
    }
  }
  return 1;
}

type DailyAnalysisJobResult = {
  skipped: boolean;
  created: boolean;
  skippedByCooldown: boolean;
  cooldownUntil: string | null;
  message: string;
  cycleId: string | null;
  proposalCount: number;
  telegram: { sent: boolean };
  feishu: { sent: boolean };
  marketRefresh: { ok: boolean; refreshedCount?: number; reason?: string };
  dailyReport: { sent: boolean; telegram: boolean; feishu: boolean };
  autoExecute: { attempted: boolean; executed: boolean; ordersCount: number; error?: string; blockedReason?: string | null };
  at: string;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const fallbackKey = buildUtcCronWindowIdempotencyKey("cron_daily_analysis", 60);
    const runs = await runForEachActiveDaaAccountScope((scope) =>
      runDailyAnalysisJob(req, buildAccountScopedRequestIdempotencyKey(scope, req, fallbackKey)),
    );
    const single = unwrapSingleAccountCronResult(runs);
    return ok(single ?? summarizeAccountScopedCronRuns(runs));
  });
}

async function runDailyAnalysisJob(req: Request, idempotencyKey: string | null): Promise<Record<string, unknown>> {
    return runIdempotentAccountScopedCronJob<DailyAnalysisJobResult>({
      req,
      jobType: "cron_daily_analysis",
      triggerSource: "cron_daily_analysis",
      idempotencyKey,
      duplicateReason: "当前账号同一 daily-analysis 幂等任务已完成，跳过重复触发。",
      summarize: (result) => ({
        skipped: result.skipped,
        created: result.created,
        cycleId: result.cycleId,
        proposalCount: result.proposalCount,
        marketRefreshOk: result.marketRefresh?.ok,
        dailyReportSent: result.dailyReport?.sent,
        autoExecuteAttempted: result.autoExecute?.attempted,
        autoExecuteOk: result.autoExecute?.executed,
        autoExecuteOrders: result.autoExecute?.ordersCount,
      }),
      handler: async ({ jobId }) => {
        const system = await getDaaSystemConfig();

        // Hour guard: skip if current UTC hour doesn't match configured hour.
        // Allows cron to run every hour while the actual trigger time is configurable.
        const configuredHour = resolveScheduledHourUtc(system.config);
        const currentHour = new Date().getUTCHours();
        const forcedByHeader = req.headers.get("x-daa-force") === "1";
        if (!forcedByHeader && currentHour !== configuredHour) {
          return {
            skipped: true,
            created: false,
            skippedByCooldown: false,
            cooldownUntil: null,
            message: `hour guard: current UTC hour ${currentHour} != configured ${configuredHour}`,
            cycleId: null,
            proposalCount: 0,
            telegram: { sent: false },
            feishu: { sent: false },
            marketRefresh: { ok: true, refreshedCount: 0 },
            autoExecute: { attempted: false, executed: false, ordersCount: 0 },
            dailyReport: { sent: false, telegram: false, feishu: false },
            at: new Date().toISOString(),
          };
        }
        const policy = resolvePolicyConfig(system.config);
        const notif = system.config.notification;

        // ── Phase A: auto-generate rebalance cycle (gated by policy execution) ──
        let autoGenerate: Omit<DailyAnalysisJobResult, "dailyReport" | "at" | "autoExecute">;
        let generatedCycleForAutoExecute: RebalanceCycle | null = null;

        if (policy.enabled && policy.review.enabled && policy.execution.autoGenerateEnabled) {
          let marketRefresh: { ok: boolean; refreshedCount?: number; reason?: string } = { ok: true, refreshedCount: 0 };
          try {
            const refreshed = await refreshMarketIndicators();
            marketRefresh = { ok: true, refreshedCount: refreshed.refreshedCount };
          } catch (error) {
            marketRefresh = {
              ok: false,
              reason: error instanceof Error ? error.message : String(error),
            };
          }

          const generated = await generateWorkbenchRebalanceCycle({
            triggerSource: "scheduled_review",
            triggerReason: "定期组合复盘",
            manual: false,
          });

          const cycle = generated.cycle;
          generatedCycleForAutoExecute = cycle;

          // Send notifications for onSuggestionGenerated
          // 抑制 0 提案推送：复核判断为“今日无须调仓”时不发 TG/飞书（噪声消息）
          let telegramSent = false;
          let feishuSent = false;
          if (cycle && generated.created && cycle.proposals.length > 0) {
            const text = buildRebalanceSuggestionNotificationText({
              cycleId: cycle.cycleId,
              triggerReason: cycle.triggerReason,
              riskStatus: cycle.riskCheck.overallStatus,
              proposals: cycle.proposals.map((row) => ({
                symbol: row.symbol,
                side: row.side,
                suggestedNotional: row.suggestedNotional,
              })),
              agentDecisionSnapshot: cycle.agentDecisionSnapshot ?? null,
              source: "daily-analysis",
            });

            const sends: Promise<boolean>[] = [];
            if (notif.telegram.enabled && notif.telegram.onSuggestionGenerated) {
              sends.push(sendTelegramByEnv(text, {
                eventType: "suggestion_generated",
                triggerSource: "cron_daily_analysis",
                jobId,
                cycleId: cycle.cycleId,
                parseMode: null,
                requestJson: {
                  notificationKind: "review_required",
                  category: "rebalance",
                  severity: "actionable",
                  proposalCount: cycle.proposals.length,
                  riskStatus: cycle.riskCheck.overallStatus,
                },
              }).then((sent) => { telegramSent = sent; return sent; }));
            }
            if (notif.feishu.enabled && notif.feishu.onSuggestionGenerated) {
              sends.push(sendFeishuByEnv(text, {
                eventType: "suggestion_generated",
                triggerSource: "cron_daily_analysis",
                jobId,
                cycleId: cycle.cycleId,
                requestJson: {
                  notificationKind: "review_required",
                  category: "rebalance",
                  severity: "actionable",
                  proposalCount: cycle.proposals.length,
                  riskStatus: cycle.riskCheck.overallStatus,
                },
              }).then((sent) => { feishuSent = sent; return sent; }));
            }
            try {
              await Promise.allSettled(sends);
            } catch (err) {
  logSwallowed("dailyAnalysisRoute.notify", err);
            }
          }

          autoGenerate = {
            skipped: !generated.created,
            created: generated.created,
            skippedByCooldown: generated.skippedByCooldown,
            cooldownUntil: generated.cooldownUntil,
            message: generated.message,
            cycleId: cycle?.cycleId || null,
            proposalCount: cycle?.proposals.length || 0,
            telegram: { sent: telegramSent },
            feishu: { sent: feishuSent },
            marketRefresh,
          };
        } else {
          autoGenerate = {
            skipped: true,
            created: false,
            skippedByCooldown: false,
            cooldownUntil: null,
            message: "policy auto generate disabled",
            cycleId: null,
            proposalCount: 0,
            telegram: { sent: false },
            feishu: { sent: false },
            marketRefresh: { ok: true, refreshedCount: 0 },
          };
        }

        // ── Phase C: auto-execute（统一交给 AutomationAuthority 判定） ──
        let autoExecute: { attempted: boolean; executed: boolean; ordersCount: number; error?: string; blockedReason?: string | null } = {
          attempted: false,
          executed: false,
          ordersCount: 0,
        };

        if (autoGenerate.created && autoGenerate.cycleId) {
          const result = await executeAutoRebalanceCycle({
            cycle: generatedCycleForAutoExecute ?? {
              cycleId: autoGenerate.cycleId,
              proposals: [],
            },
            systemConfig: system.config,
            triggerSource: "cron_daily_analysis",
          });
          autoExecute = {
            attempted: result.attempted,
            executed: result.executed,
            ordersCount: result.ordersCount,
            error: result.error || result.blockedReason || undefined,
            blockedReason: result.blockedReason,
          };
        }

        // ── Phase D: daily report (independent of autoGenerateEnabled) ──
        const wantTgReview = notif.telegram.enabled && notif.telegram.dailyReport;
        const wantFsReview = notif.feishu.enabled && notif.feishu.dailyReport;
        // 若投资助理复核启用，则 agent_briefing 已覆盖每日复核通知的所有信息
        // （持仓、需要复核的变化、判断不一致、风险暴露等），无条件跳过 daily_report 避免重复推送。
        // 仅当用户主动关闭投资助理复核时，daily_report 才作为 fallback 发送。
        const agentEnabled = system.config.cognitiveAgent?.enabled !== false;
        let dailyReport: { sent: boolean; telegram: boolean; feishu: boolean } = {
          sent: false,
          telegram: false,
          feishu: false,
        };

        if ((wantTgReview || wantFsReview) && !agentEnabled) {
          try {
            // 当日去重：防止 cron 重试或手动触发导致重复发送
            const alreadySentToday = await hasTodayNotification("daily_report").catch(() => false);
            if (alreadySentToday) {
              console.log("[dailyAnalysis] 每日复核已于今日发送，跳过重复发送");
            } else {
              const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
              const reviewText = await buildDailyReviewText(bootstrap);

              const sends: Promise<void>[] = [];
              if (wantTgReview) {
                sends.push(
                  sendTelegramByEnv(reviewText, {
                    eventType: "daily_report",
                    triggerSource: "cron_daily_analysis",
                    jobId,
                    cycleId: autoGenerate.cycleId,
                    parseMode: DAILY_REVIEW_PARSE_MODE as "HTML",
                    requestJson: { reportType: "daily_analysis" },
                  }).then((sent) => { dailyReport.telegram = sent; }),
                );
              }
              if (wantFsReview) {
                sends.push(
                  sendFeishuByEnv(reviewText, {
                    eventType: "daily_report",
                    triggerSource: "cron_daily_analysis",
                    jobId,
                    cycleId: autoGenerate.cycleId,
                    requestJson: { reportType: "daily_analysis" },
                  }).then((sent) => { dailyReport.feishu = sent; }),
                );
              }
              await Promise.allSettled(sends);
              dailyReport.sent = dailyReport.telegram || dailyReport.feishu;
            }
          } catch (err) {
            logSwallowed("dailyAnalysisRoute.dailyReview", err);
          }
        }

        return {
          ...autoGenerate,
          autoExecute,
          dailyReport,
          at: new Date().toISOString(),
        };
      },
    });
}
