import { NextResponse } from "next/server";

import type { ApiErrorCode } from "@/src/daa/api/contracts";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function statusFromCode(code: ApiErrorCode): number {
  if (code === "UNAUTHORIZED" || code === "CRON_AUTH_FAILED") return 401;
  if (code === "VALIDATION_FAILED") return 400;
  if (code === "NOT_FOUND") return 404;
  if (code === "BROKER_SESSION_NOT_READY") return 409;
  if (code === "DB_ERROR") return 503;
  return 500;
}

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) }, init);
}

export function fail(
  code: ApiErrorCode,
  message: string,
  opts: {
    status?: number;
    details?: unknown;
    headers?: HeadersInit;
  } = {},
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(opts.details !== undefined ? { details: opts.details } : {}),
      },
    },
    {
      status: opts.status ?? statusFromCode(code),
      headers: opts.headers,
    },
  );
}

export function mapDeniedResponse(denied: Response | null): Response | null {
  if (!denied) return null;
  const status = denied.status || 401;
  const headers = Object.fromEntries(denied.headers.entries());
  if (status === 401 || status === 403) {
    return fail("UNAUTHORIZED", "unauthorized", { status, headers });
  }
  return fail("ROUTE_DENIED", "request denied", { status, headers });
}

function isDbErrorMessage(message: string): boolean {
  return /database|postgres|connect|timeout|query|sql|pool/i.test(message);
}

export function errorToResponse(error: unknown): Response {
  console.error("[DAA API]", error);
  const message = error instanceof Error ? error.message : String(error);
  const status = Number((error as { status?: unknown } | null)?.status);
  const details = (error as { details?: unknown } | null)?.details;
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    // 不泄露内部错误详情 — 仅返回安全的错误码
    const safeMessage = status === 404 ? "not_found" : status === 409 ? "conflict" : "request_error";
    return fail(status === 409 ? "BROKER_SESSION_NOT_READY" : status === 404 ? "NOT_FOUND" : "UNKNOWN", safeMessage, {
      status,
    });
  }
  if (/not found/i.test(message)) {
    return fail("NOT_FOUND", "not_found", { status: 404 });
  }
  if (isDbErrorMessage(message)) {
    return fail("DB_ERROR", "service temporarily unavailable", { status: 503 });
  }
  return fail("INTERNAL_ERROR", "internal server error", { status: 500 });
}

export async function withApiHandler(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function readJsonBody<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch (err) {
    logSwallowed("routeHelpers.readJsonBody", err);
    return null;
  }
}

/**
 * 严格版 readJsonBody：解析失败时抛出错误（由 withApiHandler 捕获后返回 400）。
 * 适用于要求请求体必须为有效 JSON 的路由。
 */
export async function readJsonBodyStrict<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw Object.assign(new Error("请求体不是有效的 JSON"), { status: 400 });
  }
}
