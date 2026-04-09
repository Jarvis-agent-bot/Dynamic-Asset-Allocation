/**
 * POST /api/daa/cron/cognitive-agent — 定时触发 Cognitive Agent 循环
 *
 * 建议频率：每日 2 次（开盘前 + 收盘后）
 * 例：0 13 * * 1-5（UTC 13:00 = US 开盘前）、0 21 * * 1-5（UTC 21:00 = US 收盘后）
 */

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分钟

import { withApiHandler, ok, fail } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import { countThreads } from "@/src/daa/agent/store/thesisStore";
import { countMemories } from "@/src/daa/agent/store/memoryStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) return fail("CRON_AUTH_FAILED", "认证失败", { status: 401 });

    // 检查是否有活跃 thesis（如果没有，提示需要先 bootstrap）
    const threadCount = await countThreads();
    if (threadCount === 0) {
      return ok({
        skipped: true,
        reason: "无活跃研究论点。请先调用 POST /api/daa/agent/bootstrap 初始化。",
      });
    }

    const execution = await runLoggedJob({
      req,
      jobType: "cron_cognitive_agent",
      triggerSource: "cron_cognitive_agent",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (result) => ({
        runId: result.runId,
        thesesUpdated: result.thesesUpdated,
        surprisesCount: result.surprises.length,
        totalTokens: result.totalTokens,
        errorsCount: result.errors.length,
      }),
      handler: async () => {
        return await runCognitiveAgentCycle("scheduled");
      },
    });

    const memoryCount = await countMemories();

    return ok({
      ...execution.result,
      threadCount,
      memoryCount,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}
