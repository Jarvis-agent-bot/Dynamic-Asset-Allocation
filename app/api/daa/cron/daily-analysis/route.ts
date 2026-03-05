import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { generateWorkbenchRebalanceCycleV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { sendEmailByEnvV1 } from "@/src/daa/notify/emailV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";

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
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const system = await getDaaSystemConfigV2();
    const strategy = system.config.rebalanceStrategy;
    if (!strategy.autoGenerateEnabled) {
      return okV1({
        skipped: true,
        reason: "auto generate disabled",
        at: new Date().toISOString(),
      });
    }

    const generated = await generateWorkbenchRebalanceCycleV1({
      triggerSource: "calendar",
      triggerReason: "定期再平衡触发",
      manual: false,
    });

    const cycle = generated.cycle;
    const recipient = strategy.notifyEmailTo;
    let email: Awaited<ReturnType<typeof sendEmailByEnvV1>> | null = null;
    if (cycle && generated.created && recipient && system.config.notification.email.onSuggestionGenerated) {
      email = await sendEmailByEnvV1({
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

    return okV1({
      skipped: !generated.created,
      created: generated.created,
      skippedByCooldown: generated.skippedByCooldown,
      cooldownUntil: generated.cooldownUntil,
      message: generated.message,
      cycleId: cycle?.cycleId || null,
      proposalCount: cycle?.proposals.length || 0,
      email: emailResult,
      at: new Date().toISOString(),
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
