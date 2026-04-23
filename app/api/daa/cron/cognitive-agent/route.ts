/**
 * POST /api/daa/cron/cognitive-agent — 定时触发 Cognitive Agent 循环
 *
 * Feature D: 自门控 — 外部 cron 可频繁触发（如每小时），本路由检查当前 UTC 时间
 * 是否匹配配置的 scheduleTimesUtc，不匹配则跳过。
 *
 * 配置在 Settings → 认知 Agent → 运行频率 / 运行时间
 */

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分钟

import { withApiHandler, ok, fail } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { runAutopilotLoop } from "@/src/daa/agent/autopilotOrchestrator";
import { countThreads } from "@/src/daa/agent/store/thesisStore";
import { countMemories } from "@/src/daa/agent/store/memoryStore";
import { getDaaSystemConfig } from "@/src/daa/store/accountStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) return fail("CRON_AUTH_FAILED", "认证失败", { status: 401 });

    // Feature D: 自门控 — 检查配置判断是否应该运行
    try {
      const sysConfig = await getDaaSystemConfig();
      const ca = sysConfig.config.cognitiveAgent;
      if (ca) {
        if (!ca.enabled) {
          return ok({ skipped: true, reason: "认知 Agent 已在设置中禁用。" });
        }
        if (ca.schedule === "manual_only") {
          return ok({ skipped: true, reason: "Agent 运行频率设为仅手动。" });
        }
        // 检查当前 UTC 小时是否匹配配置的调度时间
        const nowUtc = new Date();
        const nowHH = String(nowUtc.getUTCHours()).padStart(2, "0");
        const nowMM = String(nowUtc.getUTCMinutes()).padStart(2, "0");
        const nowHHMM = `${nowHH}:${nowMM}`;
        const times = ca.scheduleTimesUtc ?? [];
        // 允许 ±30 分钟窗口
        const isScheduledNow = times.some(t => {
          const [h, m] = t.split(":").map(Number);
          const scheduledMinutes = h * 60 + m;
          const currentMinutes = nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes();
          return Math.abs(scheduledMinutes - currentMinutes) <= 30;
        });
        if (!isScheduledNow && times.length > 0) {
          return ok({ skipped: true, reason: `当前 UTC ${nowHHMM} 不在调度窗口内（配置: ${times.join(", ")}）。` });
        }
      }
    } catch (e) {
      logSwallowed("cognitiveAgent.cron.configCheck", e);
      // 配置加载失败不阻止执行
    }

    const execution = await runLoggedJob({
      req,
      jobType: "cron_cognitive_agent",
      triggerSource: "cron_cognitive_agent",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (result) => ({
        skipped: result.skipped,
        runId: result.cognitiveRun.runId,
        thesesUpdated: result.cognitiveRun.thesesUpdated,
        surprisesCount: result.cognitiveRun.surprisesCount,
        totalTokens: result.cognitiveRun.totalTokens,
        configPatchCount: result.configPatch.paths.length,
        rebalanceCycleId: result.rebalance.cycleId,
        autoExecutedOrders: result.rebalance.autoExecute.ordersCount,
        errorsCount: result.cognitiveRun.errors.length,
      }),
      handler: async () => {
        return await runAutopilotLoop({
          source: "cron_cognitive_agent",
          reason: "scheduled cognitive tick",
        });
      },
    });

    const threadCount = await countThreads();
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
