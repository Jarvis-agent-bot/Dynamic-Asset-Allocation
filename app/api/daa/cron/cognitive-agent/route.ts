/**
 * POST /api/daa/cron/cognitive-agent — 定时触发 Cognitive Agent 循环
 *
 * Feature D: 自门控 — 外部 cron 可频繁触发（如每小时），本路由检查当前 UTC 时间
 * 是否匹配由 schedule 派生出的 UTC 窗口，不匹配则跳过。
 *
 * 配置在 Settings → 认知 Agent → 运行频率
 */

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分钟

import { withApiHandler, ok, fail } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { findRecentJobExecutionByIdempotencyKey } from "@/src/daa/store/jobExecutionLogRepo";
import { runAutopilotLoop } from "@/src/daa/agent/autopilotOrchestrator";
import { deriveCognitiveAgentScheduleTimesUtc } from "@/src/daa/config/systemConfig";
import { countThreads } from "@/src/daa/agent/store/thesisStore";
import { countMemories } from "@/src/daa/agent/store/memoryStore";
import { getDaaSystemConfig } from "@/src/daa/store/accountStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function findScheduledWindow(nowUtc: Date, times: string[]): { time: string; scheduledAt: Date } | null {
  let best: { time: string; scheduledAt: Date; diffMinutes: number } | null = null;
  for (const time of times) {
    const [h, m] = time.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    for (const dayOffset of [-1, 0, 1]) {
      const scheduledAt = new Date(Date.UTC(
        nowUtc.getUTCFullYear(),
        nowUtc.getUTCMonth(),
        nowUtc.getUTCDate() + dayOffset,
        h,
        m,
        0,
        0,
      ));
      const diffMinutes = Math.abs(scheduledAt.getTime() - nowUtc.getTime()) / 60000;
      if (diffMinutes <= 30 && (!best || diffMinutes < best.diffMinutes)) {
        best = { time, scheduledAt, diffMinutes };
      }
    }
  }
  return best ? { time: best.time, scheduledAt: best.scheduledAt } : null;
}

async function withJobIdempotencyLock<T>(
  jobType: string,
  idempotencyKey: string | null,
  run: () => Promise<T>,
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  if (!idempotencyKey) {
    return { acquired: true, result: await run() };
  }

  const lockKey = `daa:${jobType}:${idempotencyKey}`;
  return withDaaPgClient(async ({ query }) => {
    const lock = await query(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      [lockKey],
    );
    const acquired = lock.rows[0]?.acquired === true;
    if (!acquired) return { acquired: false };

    try {
      return { acquired: true, result: await run() };
    } finally {
      await query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]).catch((e) => {
        logSwallowed("cognitiveAgent.cron.idempotencyUnlock", e);
      });
    }
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) return fail("CRON_AUTH_FAILED", "认证失败", { status: 401 });

    let scheduleIdempotencyKey: string | null = null;
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
        // 检查当前 UTC 时间是否匹配当前频率对应的调度窗口
        const nowUtc = new Date();
        const nowHH = String(nowUtc.getUTCHours()).padStart(2, "0");
        const nowMM = String(nowUtc.getUTCMinutes()).padStart(2, "0");
        const nowHHMM = `${nowHH}:${nowMM}`;
        const times = deriveCognitiveAgentScheduleTimesUtc(ca.schedule ?? "daily");
        // 允许 ±30 分钟窗口，并用命中的计划槽位作为幂等 key。
        const scheduledWindow = findScheduledWindow(nowUtc, times);
        if (!scheduledWindow && times.length > 0) {
          return ok({ skipped: true, reason: `当前 UTC ${nowHHMM} 不在调度窗口内（配置: ${times.join(", ")}）。` });
        }
        if (scheduledWindow) {
          scheduleIdempotencyKey = `cron_cognitive_agent:${scheduledWindow.scheduledAt.toISOString().slice(0, 16)}`;
        }
      }
    } catch (e) {
      logSwallowed("cognitiveAgent.cron.configCheck", e);
      // 配置加载失败不阻止执行
    }

    const idempotencyKey = req.headers.get("x-daa-idempotency-key") || scheduleIdempotencyKey;
    if (idempotencyKey) {
      const duplicate = await findRecentJobExecutionByIdempotencyKey({
        jobType: "cron_cognitive_agent",
        idempotencyKey,
        withinMinutes: 90,
        statuses: ["succeeded"],
      }).catch((e) => {
        logSwallowed("cognitiveAgent.cron.dedupe", e);
        return null;
      });
      if (duplicate) {
        return ok({
          skipped: true,
          reason: "当前调度窗口已完成过认知 Agent 循环，跳过重复触发。",
          requestId: duplicate.requestId,
          jobId: duplicate.jobId,
          duplicateOf: duplicate.jobId,
          idempotencyKey,
        });
      }
    }

    const locked = await withJobIdempotencyLock("cron_cognitive_agent", idempotencyKey, () =>
      runLoggedJob({
        req,
        jobType: "cron_cognitive_agent",
        triggerSource: "cron_cognitive_agent",
        idempotencyKey,
        summarize: (result) => ({
          skipped: result.skipped,
          runId: result.cognitiveRun.runId,
          thesesUpdated: result.cognitiveRun.thesesUpdated,
          surprisesCount: result.cognitiveRun.surprisesCount,
          totalTokens: result.cognitiveRun.totalTokens,
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
      }),
    );
    if (!locked.acquired) {
      return ok({
        skipped: true,
        reason: "当前调度窗口已有认知 Agent 循环正在执行，跳过并发触发。",
        idempotencyKey,
      });
    }
    const execution = locked.result;

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
