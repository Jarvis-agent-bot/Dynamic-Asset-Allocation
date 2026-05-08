import {
  listActiveDaaAccountScopes,
  withDaaAccountScope,
  type DaaActiveAccountScope,
} from "@/src/daa/account/accountScope";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { isDaaPgEnabled, withDaaPgClient } from "@/src/daa/pg/daaPg";
import { findRecentJobExecutionByIdempotencyKey } from "@/src/daa/store/jobExecutionLogRepo";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type AccountScopedCronSuccess<T> = DaaActiveAccountScope & {
  ok: true;
  result: T;
};

export type AccountScopedCronFailure = DaaActiveAccountScope & {
  ok: false;
  error: string;
};

export type AccountScopedCronRun<T> = AccountScopedCronSuccess<T> | AccountScopedCronFailure;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}

export function buildAccountScopedIdempotencyKey(scope: DaaActiveAccountScope, baseKey: string | null | undefined): string | null {
  const key = typeof baseKey === "string" ? baseKey.trim() : "";
  if (!key) return null;
  return `${scope.scopeId}:${key}`;
}

export function buildUtcCronWindowIdempotencyKey(jobType: string, intervalMinutes: number, now = new Date()): string {
  const intervalMs = Math.max(1, Math.trunc(Number(intervalMinutes) || 1)) * 60_000;
  const slotMs = Math.floor(now.getTime() / intervalMs) * intervalMs;
  return `${jobType}:${new Date(slotMs).toISOString().slice(0, 16)}`;
}

export function buildAccountScopedRequestIdempotencyKey(
  scope: DaaActiveAccountScope,
  req: Request,
  fallbackBaseKey: string | null | undefined,
): string | null {
  const headerKey = req.headers.get("x-daa-idempotency-key");
  if (headerKey && headerKey.trim()) return buildAccountScopedIdempotencyKey(scope, headerKey);

  // 手动强制触发通常用于排障或补跑，不复用自动调度窗口 key。
  if (req.headers.get("x-daa-force") === "1") return null;
  return buildAccountScopedIdempotencyKey(scope, fallbackBaseKey);
}

export async function runForEachActiveDaaAccountScope<T>(
  run: (scope: DaaActiveAccountScope) => Promise<T>,
): Promise<AccountScopedCronRun<T>[]> {
  const scopes = await listActiveDaaAccountScopes();
  const out: AccountScopedCronRun<T>[] = [];

  for (const scope of scopes) {
    try {
      const result = await withDaaAccountScope(scope.scopeId, () => run(scope));
      out.push({ ...scope, ok: true, result });
    } catch (error) {
      out.push({ ...scope, ok: false, error: describeError(error) });
    }
  }

  return out;
}

export function summarizeAccountScopedCronRuns<T>(runs: AccountScopedCronRun<T>[]) {
  const successCount = runs.filter((run) => run.ok).length;
  const failedCount = runs.length - successCount;
  return {
    accountCount: runs.length,
    successCount,
    failedCount,
    results: runs.map((run) => {
      const account = {
        authAccountId: run.authAccountId,
        username: run.username,
        scopeId: run.scopeId,
        isPrimary: run.isPrimary,
      };
      return run.ok
        ? { ...account, ok: true, result: run.result }
        : { ...account, ok: false, error: run.error };
    }),
  };
}

export function unwrapSingleAccountCronResult<T extends Record<string, unknown>>(runs: AccountScopedCronRun<T>[]) {
  if (runs.length !== 1 || !runs[0].ok) return null;
  const run = runs[0];
  return {
    ...run.result,
    accountScope: {
      authAccountId: run.authAccountId,
      username: run.username,
      scopeId: run.scopeId,
      isPrimary: run.isPrimary,
    },
  };
}

async function withAccountScopedCronLock<T>(
  jobType: string,
  idempotencyKey: string | null,
  run: () => Promise<T>,
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  if (!idempotencyKey) return { acquired: true, result: await run() };
  const lockKey = `daa:${jobType}:${idempotencyKey}`;
  if (!isDaaPgEnabled()) return { acquired: true, result: await run() };
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
        await query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]).catch((err) => {
          logSwallowed("accountCronScope.idempotencyUnlock", err);
        });
      }
    });
  } catch (err) {
    logSwallowed("accountCronScope.idempotencyLock", err);
    return { acquired: true, result: await run() };
  }
}

export async function runIdempotentAccountScopedCronJob<T extends Record<string, unknown>>(input: {
  req?: Request;
  jobType: string;
  triggerSource: string;
  idempotencyKey: string | null;
  duplicateReason: string;
  duplicateWindowMinutes?: number;
  summarize?: (result: T) => Record<string, unknown> | null;
  handler: (context: { jobId: string; requestId: string; startedAt: string }) => Promise<T>;
}): Promise<T & { requestId: string | null; jobId: string; durationMs: number; idempotencyKey?: string | null }> {
  if (input.idempotencyKey) {
    const duplicate = await findRecentJobExecutionByIdempotencyKey({
      jobType: input.jobType,
      idempotencyKey: input.idempotencyKey,
      withinMinutes: input.duplicateWindowMinutes ?? 24 * 60,
      statuses: ["succeeded"],
    }).catch((err) => {
      logSwallowed("accountCronScope.dedupe", err);
      return null;
    });
    if (duplicate) {
      return {
        skipped: true,
        reason: input.duplicateReason,
        requestId: duplicate.requestId,
        jobId: duplicate.jobId,
        duplicateOf: duplicate.jobId,
        durationMs: 0,
        idempotencyKey: input.idempotencyKey,
      } as unknown as T & { requestId: string | null; jobId: string; durationMs: number; idempotencyKey?: string | null };
    }
  }

  const locked = await withAccountScopedCronLock(input.jobType, input.idempotencyKey, () =>
    runLoggedJob<T>({
      req: input.req,
      jobType: input.jobType,
      triggerSource: input.triggerSource,
      idempotencyKey: input.idempotencyKey,
      summarize: input.summarize,
      handler: input.handler,
    }),
  );
  if (!locked.acquired) {
    return {
      skipped: true,
      reason: "当前账号同一幂等任务正在执行，跳过并发触发。",
      requestId: null,
      jobId: "",
      durationMs: 0,
      idempotencyKey: input.idempotencyKey,
    } as unknown as T & { requestId: string | null; jobId: string; durationMs: number; idempotencyKey?: string | null };
  }

  const execution = locked.result;
  return {
    ...execution.result,
    requestId: execution.requestId,
    jobId: execution.jobId,
    durationMs: execution.durationMs,
    idempotencyKey: input.idempotencyKey,
  };
}
