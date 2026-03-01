import { NextResponse } from "next/server";

import type { ApiErrorCodeV1 } from "@/src/daa/api/contractsV1";

function statusFromCodeV1(code: ApiErrorCodeV1): number {
  if (code === "UNAUTHORIZED" || code === "CRON_AUTH_FAILED") return 401;
  if (code === "VALIDATION_FAILED") return 400;
  if (code === "NOT_FOUND") return 404;
  if (code === "DB_ERROR") return 503;
  return 500;
}

export function okV1<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) }, init);
}

export function failV1(
  code: ApiErrorCodeV1,
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
      status: opts.status ?? statusFromCodeV1(code),
      headers: opts.headers,
    },
  );
}

export function mapDeniedResponseV1(denied: Response | null): Response | null {
  if (!denied) return null;
  const status = denied.status || 401;
  const headers = Object.fromEntries(denied.headers.entries());
  if (status === 401 || status === 403) {
    return failV1("UNAUTHORIZED", "unauthorized", { status, headers });
  }
  return failV1("ROUTE_DENIED", "request denied", { status, headers });
}

function isDbErrorMessage(message: string): boolean {
  return /database|postgres|connect|timeout|query|sql|pool/i.test(message);
}

export function errorToResponseV1(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (/not found/i.test(message)) {
    return failV1("NOT_FOUND", message, { status: 404 });
  }
  if (isDbErrorMessage(message)) {
    return failV1("DB_ERROR", message, { status: 503 });
  }
  return failV1("INTERNAL_ERROR", message, { status: 500 });
}

export async function withApiHandlerV1(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return errorToResponseV1(error);
  }
}

export async function readJsonBodyV1<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
