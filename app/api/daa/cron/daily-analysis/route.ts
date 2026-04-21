import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { refreshMarketIndicators } from "@/src/daa/modules/marketContext/marketIndicatorService";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import { buildDailyReportText, DAILY_REPORT_PARSE_MODE } from "@/src/daa/notify/dailyReportBuilder";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { hasTodayNotification } from "@/src/daa/store/notificationDeliveryLogRepo";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

function resolveScheduledHourUtc(config: {
  rebalanceStrategy?: { analysisTimeUtc?: unknown };
  notification?: { dailyAnalysisHourUtc?: unknown };
}): number {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(config.rebalanceStrategy?.analysisTimeUtc || "").trim());
  if (matched) {
    const hour = Number(matched[1]);
    const minute = Number(matched[2]);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return minute > 0 ? (hour + 1) % 24 : hour;
    }
  }
  const fallbackHour = Number(config.notification?.dailyAnalysisHourUtc);
  return Number.isFinite(fallbackHour)
    ? Math.min(23, Math.max(0, Math.trunc(fallbackHour)))
    : 1;
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
  autoExecute: { attempted: boolean; executed: boolean; ordersCount: number; error?: string };
  at: string;
};

function buildNotifyText(input: {
  cycleId: string;
  triggerReason: string;
  riskStatus: string;
  proposals: Array<{ symbol: string; side: "BUY" | "SELL"; suggestedNotional: number }>;
  agentDecisionSnapshot?: {
    status: string;
    summary: string;
    keyRisks: string[];
    keyOpportunities: string[];
    overallConfidence: number;
  } | null;
}) {
  const lines: string[] = [];
  lines.push("DAA 自动再平衡建议");
  lines.push(`周期 ID：${input.cycleId}`);
  lines.push(`触发原因：${input.triggerReason}`);
  lines.push(`风控状态：${input.riskStatus}`);

  // AI summary section
  const snap = input.agentDecisionSnapshot;
  if (snap && snap.status === "ok" && snap.summary) {
    lines.push("");
    lines.push("*AI 判断*");
    lines.push(snap.summary.slice(0, 100));
    if (snap.keyRisks.length > 0) {
      lines.push(`风险: ${snap.keyRisks.slice(0, 2).join("; ")}`);
    }
    if (snap.keyOpportunities.length > 0) {
      lines.push(`机会: ${snap.keyOpportunities.slice(0, 2).join("; ")}`);
    }
    lines.push(`置信度: ${snap.overallConfidence}%`);
  }

  lines.push("");
  lines.push("建议明细：");
  if (!input.proposals.length) {
    lines.push("- 当前无建议交易。");
  } else {
    for (const row of input.proposals.slice(0, 12)) {
      lines.push(`- ${row.symbol} ${row.side === "BUY" ? "买入" : "卖出"} ${row.suggestedNotional.toFixed(2)}`);
    }
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const execution = await runLoggedJob<DailyAnalysisJobResult>({
      req,
      jobType: "cron_daily_analysis",
      triggerSource: "cron_daily_analysis",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
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
        const strategy = system.config.rebalanceStrategy;
        const notif = system.config.notification;

        // ── Phase A: auto-generate rebalance cycle (gated by autoGenerateEnabled) ──
        let autoGenerate: Omit<DailyAnalysisJobResult, "dailyReport" | "at" | "autoExecute">;

        if (strategy.autoGenerateEnabled) {
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
            triggerSource: "calendar",
            triggerReason: "定期再平衡触发",
            manual: false,
          });

          const cycle = generated.cycle;

          // Send notifications for onSuggestionGenerated
          // 抑制 0 提案推送：Agent 判断"今日无须调仓"时不发 TG/飞书（噪声消息）
          let telegramSent = false;
          let feishuSent = false;
          if (cycle && generated.created && cycle.proposals.length > 0) {
            const text = buildNotifyText({
              cycleId: cycle.cycleId,
              triggerReason: cycle.triggerReason,
              riskStatus: cycle.riskCheck.overallStatus,
              proposals: cycle.proposals.map((row) => ({
                symbol: row.symbol,
                side: row.side,
                suggestedNotional: row.suggestedNotional,
              })),
              agentDecisionSnapshot: cycle.agentDecisionSnapshot ?? null,
            });

            const sends: Promise<boolean>[] = [];
            if (notif.telegram.enabled && notif.telegram.onSuggestionGenerated) {
              sends.push(sendTelegramByEnv(text, {
                eventType: "suggestion_generated",
                triggerSource: "cron_daily_analysis",
                jobId,
                cycleId: cycle.cycleId,
                requestJson: {
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
            message: "auto generate disabled",
            cycleId: null,
            proposalCount: 0,
            telegram: { sent: false },
            feishu: { sent: false },
            marketRefresh: { ok: true, refreshedCount: 0 },
          };
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
          autoGenerate.created &&
          autoGenerate.cycleId
        ) {
          autoExecute.attempted = true;
          try {
            const execResult = await executeRebalanceViaGateway({
              cycleId: autoGenerate.cycleId,
              executeMode: "all",
              notifyMode: "fanout",
            });
            const executedCount = execResult.logs.filter((l) => l.status === "executed").length;
            autoExecute.executed = executedCount > 0;
            autoExecute.ordersCount = executedCount;
          } catch (err) {
            autoExecute.error = err instanceof Error ? err.message : String(err);
            logSwallowed("dailyAnalysisRoute.autoExecute", err);
            // 自动执行失败时发送失败通知
            const failMsg = `[自动执行失败] 周期 ${autoGenerate.cycleId}\n原因: ${autoExecute.error}`;
            try {
              const sends: Promise<boolean>[] = [];
              if (notif.telegram.enabled && notif.telegram.onTradeExecuted) {
                sends.push(sendTelegramByEnv(failMsg, {
                  eventType: "auto_execute_failed",
                  triggerSource: "cron_daily_analysis",
                  cycleId: autoGenerate.cycleId,
                  requestJson: { error: autoExecute.error },
                }));
              }
              if (notif.feishu.enabled && notif.feishu.onTradeExecuted) {
                sends.push(sendFeishuByEnv(failMsg, {
                  eventType: "auto_execute_failed",
                  triggerSource: "cron_daily_analysis",
                  cycleId: autoGenerate.cycleId,
                  requestJson: { error: autoExecute.error },
                }));
              }
              await Promise.allSettled(sends);
            } catch (notifyErr) {
              logSwallowed("dailyAnalysisRoute.autoExecuteNotify", notifyErr);
            }
          }
        }

        // ── Phase D: daily report (independent of autoGenerateEnabled) ──
        const wantTgReport = notif.telegram.enabled && notif.telegram.dailyReport;
        const wantFsReport = notif.feishu.enabled && notif.feishu.dailyReport;
        // 若 Cognitive Agent 启用，则 agent_briefing 已覆盖每日报告的所有信息
        // （持仓、意外、认知缺口、风险暴露等），无条件跳过 daily_report 避免重复推送。
        // 仅当用户主动关闭 Cognitive Agent 时，daily_report 才作为 fallback 发送。
        const agentEnabled = system.config.cognitiveAgent?.enabled !== false;
        let dailyReport: { sent: boolean; telegram: boolean; feishu: boolean } = {
          sent: false,
          telegram: false,
          feishu: false,
        };

        if ((wantTgReport || wantFsReport) && !agentEnabled) {
          try {
            // 当日去重：防止 cron 重试或手动触发导致重复发送
            const alreadySentToday = await hasTodayNotification("daily_report").catch(() => false);
            if (alreadySentToday) {
              console.log("[dailyAnalysis] 每日报告已于今日发送，跳过重复发送");
            } else {
              const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
              const reportText = await buildDailyReportText(bootstrap);

              const sends: Promise<void>[] = [];
              if (wantTgReport) {
                sends.push(
                  sendTelegramByEnv(reportText, {
                    eventType: "daily_report",
                    triggerSource: "cron_daily_analysis",
                    jobId,
                    cycleId: autoGenerate.cycleId,
                    parseMode: DAILY_REPORT_PARSE_MODE as "HTML",
                    requestJson: { reportType: "daily_analysis" },
                  }).then((sent) => { dailyReport.telegram = sent; }),
                );
              }
              if (wantFsReport) {
                sends.push(
                  sendFeishuByEnv(reportText, {
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
            logSwallowed("dailyAnalysisRoute.dailyReport", err);
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

    return ok({
      ...execution.result,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}

