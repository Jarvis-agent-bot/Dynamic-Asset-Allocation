/**
 * POST /api/daa/cron/decision-outcome
 *
 * 每日检查 1-7 天前的决策后验结果。
 * 对比决策时的建议 vs 实际市场表现，写入 outcome_result。
 */

export const runtime = "nodejs";

import { withApiHandler, ok, fail } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { checkDecisionOutcomes, type OutcomeCheckResult } from "@/src/daa/modules/today/decisionOutcomeService";
import { appendAgentLearningEvent } from "@/src/daa/agent/agentLearningRepo";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      return fail("CRON_AUTH_FAILED", "cron unauthorized", { status: 401 });
    }

    const execution = await runLoggedJob({
      req,
      jobType: "cron_decision_outcome",
      triggerSource: "cron_decision_outcome",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (result: OutcomeCheckResult) => ({
        checked: result.checked,
        updated: result.updated,
        errors: result.errors,
        learningEvents: result.details.length,
      }),
      handler: async () => {
        const result = await checkDecisionOutcomes();

        // 将后验结果写入 agent learning 事件，供 LLM 学习
        for (const detail of result.details) {
          try {
            await appendAgentLearningEvent({
              eventType: "outcome_verdict",
              title: `${detail.symbol} ${detail.verdict} (${detail.priceChangePct > 0 ? "+" : ""}${detail.priceChangePct.toFixed(1)}%)`,
              summary: `决策${detail.userAction === "adopted" ? "已采纳" : "已忽略"}, ${detail.daysElapsed}天后价格${detail.direction === "up" ? "上涨" : detail.direction === "down" ? "下跌" : "持平"} ${Math.abs(detail.priceChangePct).toFixed(1)}%, 判定${detail.verdict}`,
              symbol: detail.symbol,
              contextJson: {
                verdict: detail.verdict,
                priceChangePct: detail.priceChangePct,
                direction: detail.direction,
                daysElapsed: detail.daysElapsed,
                conclusion: detail.conclusion,
                userAction: detail.userAction,
              },
            });
          } catch (e) {
            logSwallowed("decisionOutcome.appendLearning", e);
          }
        }

        return result;
      },
    });

    return ok(execution);
  });
}
