import { NextResponse } from "next/server";

import type { ApiErrorCode } from "@/src/daa/api/contracts";

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
    return fail(status === 409 ? "BROKER_SESSION_NOT_READY" : "UNKNOWN", message, {
      status,
      details,
    });
  }
  if (/not found/i.test(message)) {
    return fail("NOT_FOUND", message, { status: 404 });
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
  } catch {
    return null;
  }
}
