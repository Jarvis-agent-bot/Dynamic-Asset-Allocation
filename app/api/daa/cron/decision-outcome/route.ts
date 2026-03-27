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
import { checkDecisionOutcomes } from "@/src/daa/modules/today/decisionOutcomeService";

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
      summarize: (result: { checked: number; updated: number; errors: number }) => ({
        checked: result.checked,
        updated: result.updated,
        errors: result.errors,
      }),
      handler: async () => {
        return checkDecisionOutcomes();
      },
    });

    return ok(execution);
  });
}
