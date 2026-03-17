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

function buildNotifyText(input: {
  cycleId: string;
  triggerReason: string;
  riskStatus: string;
  proposals: Array<{ symbol: string; side: "BUY" | "SELL"; suggestedNotional: number }>;
}) {
  const lines: string[] = [];
  lines.push("DAA 自动再平衡建议");
  lines.push(`周期 ID：${input.cycleId}`);
  lines.push(`触发原因：${input.triggerReason}`);
  lines.push(`风控状态：${input.riskStatus}`);
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

    const execution = await runLoggedJob({
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
      handler: async () => {
        const system = await getDaaSystemConfig();
        const strategy = system.config.rebalanceStrategy;
        const notif = system.config.notification;

        // ── Phase A: auto-generate rebalance cycle (gated by autoGenerateEnabled) ──
        let autoGenerate: {
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
        };

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
            });

            const sends: Promise<boolean>[] = [];
            if (notif.telegram.enabled && notif.telegram.onSuggestionGenerated) {
              sends.push(sendTelegramByEnv(text).then((sent) => { telegramSent = sent; return sent; }));
            }
            if (notif.feishu.enabled && notif.feishu.onSuggestionGenerated) {
              sends.push(sendFeishuByEnv(text).then((sent) => { feishuSent = sent; return sent; }));
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
                sendTelegramByEnv(reportText).then((sent) => { dailyReport.telegram = sent; }),
              );
            }
            if (wantFsReport) {
              sends.push(
                sendFeishuByEnv(reportText).then((sent) => { dailyReport.feishu = sent; }),
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
