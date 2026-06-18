import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  buildAccountScopedRequestIdempotencyKey,
  runForEachActiveDaaAccountScope,
  runIdempotentAccountScopedCronJob,
  summarizeAccountScopedCronRuns,
  unwrapSingleAccountCronResult,
} from "@/src/daa/cron/accountCronScope";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { DAA_BRAND_NAME } from "@/src/daa/brand";
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { getDaaSystemConfig, listDaaRebalanceCycles, listDaaTradeTickets } from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type MonthlyReportJobResult = {
  month: string;
  telegram: { sent: boolean };
  feishu: { sent: boolean };
  stats: {
    holdingCount: number;
    cycleCount: number;
    tradeCount: number;
    totalEquity: number | null;
    cash: number;
  };
  at: string;
};

function formatNum(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function getPreviousMonthLabel(now = new Date()): string {
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthlyReportText(input: {
  monthLabel: string;
  holdingCount: number;
  cycleCount: number;
  tradeCount: number;
  totalEquity: number | null;
  cash: number;
  baseCurrency: string;
  topHoldings: Array<{ symbol: string; weightPct: number }>;
  maxDriftPct: number;
}): string {
  const lines: string[] = [];
  lines.push(`📊 **月度投资报告 — ${input.monthLabel}**`);
  lines.push("");
  lines.push("*组合概览*");
  lines.push(
    `总权益: ${input.totalEquity != null ? `${input.baseCurrency} ${formatNum(input.totalEquity)}` : "N/A"} | 现金: ${input.baseCurrency} ${formatNum(input.cash)}`,
  );
  lines.push(`持仓标的: ${input.holdingCount} 个`);
  lines.push("");
  lines.push("*本月操作*");
  lines.push(`再平衡周期: ${input.cycleCount} 次`);
  lines.push(`交易笔数: ${input.tradeCount} 笔`);
  lines.push(`最大漂移: ${input.maxDriftPct.toFixed(1)}%`);
  lines.push("");

  if (input.topHoldings.length > 0) {
    lines.push("*前五大持仓*");
    for (const h of input.topHoldings.slice(0, 5)) {
      lines.push(`- ${h.symbol}: ${h.weightPct.toFixed(1)}%`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`注：月报自动生成，详细数据请登录 ${DAA_BRAND_NAME} 查看。`);
  return lines.join("\n");
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const fallbackKey = `cron_monthly_report:${getPreviousMonthLabel()}`;
    const runs = await runForEachActiveDaaAccountScope((scope) =>
      runMonthlyReportJob(req, buildAccountScopedRequestIdempotencyKey(scope, req, fallbackKey)),
    );
    const single = unwrapSingleAccountCronResult(runs);
    return ok(single ?? summarizeAccountScopedCronRuns(runs));
  });
}

async function runMonthlyReportJob(req: Request, idempotencyKey: string | null): Promise<Record<string, unknown>> {
    return runIdempotentAccountScopedCronJob<MonthlyReportJobResult>({
      req,
      jobType: "cron_monthly_report",
      triggerSource: "cron_monthly_report",
      idempotencyKey,
      duplicateReason: "当前账号同一 monthly-report 幂等任务已完成，跳过重复触发。",
      duplicateWindowMinutes: 45 * 24 * 60,
      summarize: (result) => ({
        month: result.month,
        telegramSent: result.telegram.sent,
        feishuSent: result.feishu.sent,
        holdingCount: result.stats.holdingCount,
      }),
      handler: async ({ jobId }) => {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthLabel = getPreviousMonthLabel(now);

        const [system, bootstrap, cycles, tickets] = await Promise.all([
          getDaaSystemConfig(),
          buildWorkbenchBootstrap({ syncPrices: false }),
          listDaaRebalanceCycles(200),
          listDaaTradeTickets({ limit: 1000 }),
        ]);

        // 筛选上月数据（使用本月 1 日作为排除边界，避免遗漏月末最后一天的数据）
        const lastMonthStart = lastMonth.toISOString();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthCycles = cycles.filter((c) => {
          const ts = c.createdAt;
          return ts >= lastMonthStart && ts < currentMonthStart;
        });
        const monthTickets = tickets.filter((t) => {
          const ts = t.createdAt;
          return ts >= lastMonthStart && ts < currentMonthStart;
        });

        const holdings = bootstrap.assetUniverse.filter(isVisibleHolding);
        const topHoldings = [...holdings]
          .sort((a, b) => b.actualWeightPct - a.actualWeightPct)
          .slice(0, 5)
          .map((a) => ({ symbol: a.symbol, weightPct: a.actualWeightPct }));

        const maxDriftPct = holdings.reduce(
          (max, a) => Math.max(max, Math.abs(a.gapPct ?? 0)),
          0,
        );

        const reportText = buildMonthlyReportText({
          monthLabel,
          holdingCount: holdings.length,
          cycleCount: monthCycles.length,
          tradeCount: monthTickets.length,
          totalEquity: bootstrap.account.totalEquity,
          cash: bootstrap.account.cash,
          baseCurrency: bootstrap.baseCurrency,
          topHoldings,
          maxDriftPct,
        });

        const notif = system.config.notification;
        let telegramSent = false;
        let feishuSent = false;

        try {
          const sends: Promise<void>[] = [];
          if (notif.telegram.enabled) {
            sends.push(
              sendTelegramByEnv(reportText, {
                eventType: "monthly_report",
                triggerSource: "cron_monthly_report",
                jobId,
                cycleId: null,
                requestJson: { month: monthLabel },
              }).then((sent) => {
                telegramSent = sent;
              }),
            );
          }
          if (notif.feishu.enabled) {
            sends.push(
              sendFeishuByEnv(reportText, {
                eventType: "monthly_report",
                triggerSource: "cron_monthly_report",
                jobId,
                cycleId: null,
                requestJson: { month: monthLabel },
              }).then((sent) => {
                feishuSent = sent;
              }),
            );
          }
          await Promise.allSettled(sends);
        } catch (err) {
          logSwallowed("monthlyReportRoute.notify", err);
        }

        return {
          month: monthLabel,
          telegram: { sent: telegramSent },
          feishu: { sent: feishuSent },
          stats: {
            holdingCount: holdings.length,
            cycleCount: monthCycles.length,
            tradeCount: monthTickets.length,
            totalEquity: bootstrap.account.totalEquity,
            cash: bootstrap.account.cash,
          },
          at: now.toISOString(),
        };
      },
    });
}
