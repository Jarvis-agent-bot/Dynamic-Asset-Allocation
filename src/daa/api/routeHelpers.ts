import { NextResponse } from "next/server";

import type { ApiErrorCode } from "@/src/daa/api/contracts";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

function statusFromCode(code: ApiErrorCode): number {
  if (code === "UNAUTHORIZED" || code === "CRON_AUTH_FAILED") return 401;
  if (code === "VALIDATION_FAILED") return 400;
  if (code === "NOT_FOUND") return 404;
  if (code === "BROKER_SESSION_NOT_READY") return 409;
  if (code === "MARKET_CLOSED" || code === "UNSUPPORTED_MARKET") return 409;
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

function errorToResponse(error: unknown): Response {
  console.error("[DAA API]", error);
  const message = error instanceof Error ? error.message : String(error);
  const status = Number((error as { status?: unknown } | null)?.status);
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

function setApiTimingHeaders(response: Response, startedAt: number): Response {
  const durationMs = Math.max(0, Date.now() - startedAt);
  const durationText = durationMs.toFixed(1);
  try {
    const existingServerTiming = response.headers.get("server-timing");
    response.headers.set(
      "Server-Timing",
      existingServerTiming ? `${existingServerTiming}, daa;dur=${durationText}` : `daa;dur=${durationText}`,
    );
    response.headers.set("X-DAA-Route-Time-Ms", durationText);
  } catch (err) {
    logSwallowed("routeHelpers.setApiTimingHeaders", err);
  }
  return response;
}

export async function withApiHandler(handler: () => Promise<Response>): Promise<Response> {
  const startedAt = Date.now();
  try {
    return setApiTimingHeaders(await handler(), startedAt);
  } catch (error) {
    return setApiTimingHeaders(errorToResponse(error), startedAt);
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
