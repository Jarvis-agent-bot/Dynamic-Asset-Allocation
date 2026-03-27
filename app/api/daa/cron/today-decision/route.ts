/**
 * POST /api/daa/cron/today-decision
 *
 * Cron 预计算：每 30 分钟生成今日决策结论并缓存。
 * 页面加载时直接读缓存，不做同步 LLM 调用。
 */

export const runtime = "nodejs";

import { withApiHandler, ok, fail } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { buildWorkbenchBootstrapBundle } from "@/src/daa/modules/workbench/workbenchReadService";
import { buildTodayDecisionContext } from "@/src/daa/modules/today/todayDecisionContext";
import { generateTodayDecision } from "@/src/daa/modules/today/todayLlmPrompt";
import { listRecentDecisions, upsertTodayCache } from "@/src/daa/store/todayStore";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      return fail("CRON_AUTH_FAILED", "cron unauthorized", { status: 401 });
    }

    const execution = await runLoggedJob({
      req,
      jobType: "cron_today_decision",
      triggerSource: "cron_today_decision",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (result: { conclusion: string; status: string; cachedAt: string }) => ({
        conclusion: result.conclusion,
        status: result.status,
        cachedAt: result.cachedAt,
      }),
      handler: async () => {
        // 1. 获取 bootstrap 数据
        const { bootstrap } = await buildWorkbenchBootstrapBundle({
          syncPrices: false,
          autoRiskCycle: false,
        });

        // 2. 获取近期决策记录
        const decisions = await listRecentDecisions("default", 10);

        // 3. 构建决策上下文
        const decisionContext = buildTodayDecisionContext(bootstrap, decisions);

        // 4. 调用 LLM
        const llmOutput = await generateTodayDecision(decisionContext);

        // 5. 写入缓存
        await upsertTodayCache({ decisionContext, llmOutput });

        return {
          conclusion: llmOutput.conclusion,
          status: llmOutput.status,
          cachedAt: new Date().toISOString(),
        };
      },
    });

    return ok(execution);
  });
}
