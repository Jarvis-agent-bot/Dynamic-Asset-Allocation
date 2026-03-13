import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { refreshMarketIndicators } from "@/src/daa/modules/marketContext/marketIndicatorService";
import { sendEmailByEnv } from "@/src/daa/notify/email";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

export const runtime = "nodejs";

function buildMailText(input: {
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
    const denied = requireCronAuth(req);
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
        marketRefreshOk: result.marketRefresh.ok,
      }),
      handler: async () => {
        const system = await getDaaSystemConfig();
        const strategy = system.config.rebalanceStrategy;
        if (!strategy.autoGenerateEnabled) {
          return {
            skipped: true,
            created: false,
            skippedByCooldown: false,
            cooldownUntil: null,
            reason: "auto generate disabled",
            message: "auto generate disabled",
            cycleId: null,
            proposalCount: 0,
            email: { sent: false, reason: "auto generate disabled" },
            marketRefresh: { ok: true, refreshedCount: 0 },
            at: new Date().toISOString(),
          };
        }

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
        const recipient = strategy.notifyEmailTo;
        let email: Awaited<ReturnType<typeof sendEmailByEnv>> | null = null;
        if (cycle && generated.created && recipient && system.config.notification.email.onSuggestionGenerated) {
          email = await sendEmailByEnv({
            to: recipient,
            subject: `DAA 自动再平衡建议 ${new Date().toISOString().slice(0, 10)}`,
            text: buildMailText({
              cycleId: cycle.cycleId,
              triggerReason: cycle.triggerReason,
              riskStatus: cycle.riskCheck.overallStatus,
              proposals: cycle.proposals.map((row) => ({
                symbol: row.symbol,
                side: row.side,
                suggestedNotional: row.suggestedNotional,
              })),
            }),
          });
        }
        const emailResult = email || {
          sent: false,
          reason: !generated.created
            ? "本次未生成新周期，跳过邮件通知"
            : (!recipient
              ? "未配置邮件收件人"
              : (system.config.notification.email.onSuggestionGenerated ? "邮件服务未返回结果" : "邮件通知开关关闭")),
        };

        return {
          skipped: !generated.created,
          created: generated.created,
          skippedByCooldown: generated.skippedByCooldown,
          cooldownUntil: generated.cooldownUntil,
          message: generated.message,
          cycleId: cycle?.cycleId || null,
          proposalCount: cycle?.proposals.length || 0,
          email: emailResult,
          marketRefresh,
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
