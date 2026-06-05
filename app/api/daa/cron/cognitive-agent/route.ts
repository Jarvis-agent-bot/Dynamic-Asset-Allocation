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
import {
  buildAccountScopedRequestIdempotencyKey,
  runForEachActiveDaaAccountScope,
  summarizeAccountScopedCronRuns,
  unwrapSingleAccountCronResult,
} from "@/src/daa/cron/accountCronScope";
import type { DaaActiveAccountScope } from "@/src/daa/account/accountScope";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { isDaaPgEnabled, withDaaPgClient } from "@/src/daa/pg/daaPg";
import { findRecentJobExecutionByIdempotencyKey } from "@/src/daa/store/jobExecutionLogRepo";
import { runAutopilotLoop } from "@/src/daa/agent/autopilotOrchestrator";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import { resolveBrainConfig } from "@/src/daa/brain/brainPolicy";
import { deriveCognitiveAgentScheduleTimesUtc } from "@/src/daa/config/systemConfig";
import { countThreads } from "@/src/daa/agent/store/thesisStore";
import { countMemories } from "@/src/daa/agent/store/memoryStore";
import { getDaaSystemConfig } from "@/src/daa/store/accountStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

type CognitiveAgentCronResult = Awaited<ReturnType<typeof runAutopilotLoop>>;

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

  if (!isDaaPgEnabled()) {
    return { acquired: true, result: await run() };
  }

  const lockKey = `daa:${jobType}:${idempotencyKey}`;
  try {
    return await withDaaPgClient(async ({ query }) => {
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
  } catch (e) {
    logSwallowed("cognitiveAgent.cron.idempotencyLock", e);
    return { acquired: true, result: await run() };
  }
}

function buildOperatorResearchOnlyResult(input: {
  brainMode: string;
  run: Awaited<ReturnType<typeof runCognitiveAgentCycle>>;
}): CognitiveAgentCronResult {
  return {
    skipped: false,
    reason: null,
    source: "cron_cognitive_agent",
    brainMode: input.brainMode,
    bootstrapped: { attempted: false, created: 0, errors: [] },
    cognitiveRun: {
      attempted: true,
      runId: input.run.runId,
      thesesUpdated: input.run.thesesUpdated,
      surprisesCount: input.run.surprises.length,
      totalTokens: input.run.totalTokens,
      durationMs: input.run.durationMs,
      errors: input.run.errors,
    },
    rebalance: {
      attempted: false,
      created: false,
      cycleId: null,
      proposalCount: 0,
      autoExecute: {
        attempted: false,
        executed: false,
        ordersCount: 0,
        blockedReason: null,
        error: null,
      },
      reason: "操作员模式只运行定时复核，不创建调仓周期。",
    },
    targetWeightPool: {
      attempted: false,
      enabled: false,
      targetPlanAvailable: false,
      acceptedCount: 0,
      skippedCount: 0,
      attemptedCount: 0,
      persistedCount: 0,
      failedCount: 0,
      minConfidence: 0,
      reason: "操作员模式不写入 AI 目标权重池。",
    },
  };
}

function buildBrainModeSkippedResult(input: {
  brainMode: string;
  reason: string;
}): CognitiveAgentCronResult {
  return {
    skipped: true,
    reason: input.reason,
    source: "cron_cognitive_agent",
    brainMode: input.brainMode,
    bootstrapped: { attempted: false, created: 0, errors: [] },
    cognitiveRun: {
      attempted: false,
      runId: null,
      thesesUpdated: 0,
      surprisesCount: 0,
      totalTokens: 0,
      durationMs: 0,
      errors: [],
    },
    rebalance: {
      attempted: false,
      created: false,
      cycleId: null,
      proposalCount: 0,
      autoExecute: {
        attempted: false,
        executed: false,
        ordersCount: 0,
        blockedReason: null,
        error: null,
      },
      reason: null,
    },
    targetWeightPool: {
      attempted: false,
      enabled: false,
      targetPlanAvailable: false,
      acceptedCount: 0,
      skippedCount: 0,
      attemptedCount: 0,
      persistedCount: 0,
      failedCount: 0,
      minConfidence: 0,
      reason: null,
    },
  };
}

async function runScheduledCognitiveAgent(): Promise<CognitiveAgentCronResult> {
  const row = await getDaaSystemConfig();
  const brain = resolveBrainConfig(row.config.brain);

  if (brain.mode === "autopilot") {
    return await runAutopilotLoop({
      source: "cron_cognitive_agent",
      reason: "scheduled cognitive tick",
    });
  }

  if (brain.mode === "operator") {
    const run = await runCognitiveAgentCycle("scheduled");
    return buildOperatorResearchOnlyResult({ brainMode: brain.mode, run });
  }

  return buildBrainModeSkippedResult({
    brainMode: brain.mode,
    reason: "顾问模式不运行定时复核；需要手动查看建议。",
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) return fail("CRON_AUTH_FAILED", "认证失败", { status: 401 });

    const runs = await runForEachActiveDaaAccountScope((scope) => runCognitiveAgentJob(req, scope));
    const single = unwrapSingleAccountCronResult(runs);
    return ok(single ?? summarizeAccountScopedCronRuns(runs));
  });
}

async function runCognitiveAgentJob(req: Request, scope: DaaActiveAccountScope): Promise<Record<string, unknown>> {
    let scheduleIdempotencyKey: string | null = null;
    // Feature D: 自门控 — 检查配置判断是否应该运行
    try {
      const sysConfig = await getDaaSystemConfig();
      const ca = sysConfig.config.cognitiveAgent;
      if (ca) {
        if (!ca.enabled) {
          return { skipped: true, reason: "认知 Agent 已在设置中禁用。" };
        }
        if (ca.schedule === "manual_only") {
          return { skipped: true, reason: "Agent 运行频率设为仅手动。" };
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
          return { skipped: true, reason: `当前 UTC ${nowHHMM} 不在调度窗口内（配置: ${times.join(", ")}）。` };
        }
        if (scheduledWindow) {
          scheduleIdempotencyKey = `cron_cognitive_agent:${scheduledWindow.scheduledAt.toISOString().slice(0, 16)}`;
        }
      }
    } catch (e) {
      logSwallowed("cognitiveAgent.cron.configCheck", e);
      // 配置加载失败不阻止执行
    }

    const idempotencyKey = buildAccountScopedRequestIdempotencyKey(scope, req, scheduleIdempotencyKey);
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
        return {
          skipped: true,
          reason: "当前调度窗口已完成过认知 Agent 循环，跳过重复触发。",
          requestId: duplicate.requestId,
          jobId: duplicate.jobId,
          duplicateOf: duplicate.jobId,
          idempotencyKey,
        };
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
          targetWeightPoolPersisted: result.targetWeightPool.persistedCount,
          targetWeightPoolFailed: result.targetWeightPool.failedCount,
          errorsCount: result.cognitiveRun.errors.length,
        }),
        handler: async () => {
          return await runScheduledCognitiveAgent();
        },
      }),
    );
    if (!locked.acquired) {
      return {
        skipped: true,
        reason: "当前调度窗口已有认知 Agent 循环正在执行，跳过并发触发。",
        idempotencyKey,
      };
    }
    const execution = locked.result;

    const threadCount = await countThreads();
    const memoryCount = await countMemories();

    return {
      ...execution.result,
      threadCount,
      memoryCount,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    };
}
