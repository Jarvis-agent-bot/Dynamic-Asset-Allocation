import { randomUUID } from "node:crypto";

import { appendJobExecutionLog } from "@/src/daa/store/jobExecutionLogRepo";

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
}

function buildRequestId(req?: Request): string {
  if (!req) return randomUUID();
  return normalizeText(req.headers.get("x-request-id") || req.headers.get("x-daa-request-id"), "") || randomUUID();
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}

export async function runLoggedJob<T>(input: {
  req?: Request;
  jobType: string;
  triggerSource: string;
  idempotencyKey?: string | null;
  summarize?: (result: T) => Record<string, unknown> | null;
  handler: (context: { jobId: string; requestId: string; startedAt: string }) => Promise<T>;
}): Promise<{
  jobId: string;
  requestId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  result: T;
}> {
  const jobId = randomUUID();
  const requestId = buildRequestId(input.req);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  try {
    const result = await input.handler({ jobId, requestId, startedAt });
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startedMs);
    try {
      await appendJobExecutionLog({
        jobId,
        jobType: input.jobType,
        requestId,
        triggerSource: input.triggerSource,
        idempotencyKey: input.idempotencyKey || null,
        status: "succeeded",
        startedAt,
        finishedAt,
        durationMs,
        resultJson: input.summarize ? (input.summarize(result) || {}) : {},
      });
    } catch {
      // ignore job log failures
    }
    return { jobId, requestId, startedAt, finishedAt, durationMs, result };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startedMs);
    try {
      await appendJobExecutionLog({
        jobId,
        jobType: input.jobType,
        requestId,
        triggerSource: input.triggerSource,
        idempotencyKey: input.idempotencyKey || null,
        status: "failed",
        startedAt,
        finishedAt,
        durationMs,
        errorText: describeError(error),
      });
    } catch {
      // ignore job log failures
    }
    throw error;
  }
}
