import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { refreshMarketIndicators } from "@/src/daa/modules/marketContext/marketIndicatorService";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import { buildDailyReportText } from "@/src/daa/notify/dailyReportBuilder";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

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
  at: string;
};

function buildNotifyText(input: {
  cycleId: string;
  triggerReason: string;
  riskStatus: string;
  proposals: Array<{ symbol: string; side: "BUY" | "SELL"; suggestedNotional: number }>;
  llmDecisionSnapshot?: {
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
  const snap = input.llmDecisionSnapshot;
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
  lines.push("");
  lines.push("备注：本系统仅自动生成建议与通知，不会自动执行交易。");
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
            dailyReport: { sent: false, telegram: false, feishu: false },
            at: new Date().toISOString(),
          };
        }
        const strategy = system.config.rebalanceStrategy;
        const notif = system.config.notification;

        // ── Phase A: auto-generate rebalance cycle (gated by autoGenerateEnabled) ──
        let autoGenerate: Omit<DailyAnalysisJobResult, "dailyReport" | "at">;

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
          let telegramSent = false;
          let feishuSent = false;
          if (cycle && generated.created) {
            const text = buildNotifyText({
              cycleId: cycle.cycleId,
              triggerReason: cycle.triggerReason,
              riskStatus: cycle.riskCheck.overallStatus,
              proposals: cycle.proposals.map((row) => ({
                symbol: row.symbol,
                side: row.side,
                suggestedNotional: row.suggestedNotional,
              })),
              llmDecisionSnapshot: cycle.llmDecisionSnapshot ?? null,
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
            } catch {
              // 通知失败不阻塞主流程
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

        // ── Phase B: daily report (independent of autoGenerateEnabled) ──
        const wantTgReport = notif.telegram.enabled && notif.telegram.dailyReport;
        const wantFsReport = notif.feishu.enabled && notif.feishu.dailyReport;
        let dailyReport: { sent: boolean; telegram: boolean; feishu: boolean } = {
          sent: false,
          telegram: false,
          feishu: false,
        };

        if (wantTgReport || wantFsReport) {
          try {
            const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
            const reportText = buildDailyReportText(bootstrap);

            const sends: Promise<void>[] = [];
            if (wantTgReport) {
              sends.push(
                sendTelegramByEnv(reportText, {
                  eventType: "daily_report",
                  triggerSource: "cron_daily_analysis",
                  jobId,
                  cycleId: autoGenerate.cycleId,
                  requestJson: {
                    reportType: "daily_analysis",
                  },
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
                  requestJson: {
                    reportType: "daily_analysis",
                  },
                }).then((sent) => { dailyReport.feishu = sent; }),
              );
            }
            await Promise.allSettled(sends);
            dailyReport.sent = dailyReport.telegram || dailyReport.feishu;
          } catch {
            // daily report 失败不阻塞
          }
        }

        return {
          ...autoGenerate,
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

export async function GET(req: Request) {
  return POST(req);
}
