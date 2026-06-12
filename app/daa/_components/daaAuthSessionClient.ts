"use client";

import { isApiResponse, type ApiResponse } from "@/src/daa/api/contracts";

export type DaaAuthMePayload = {
  account: { accountId: string; username: string; roles: string[]; status: string };
  session: {
    sessionId: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    lastSeenAt: string | null;
  };
};

type DaaAuthMeResponse = ApiResponse<DaaAuthMePayload>;

type DaaAuthSessionResult =
  | { kind: "signedIn"; me: DaaAuthMePayload }
  | { kind: "signedOut" }
  | { kind: "error"; message: string };

type RuntimeState = {
  inflight: Promise<DaaAuthSessionResult> | null;
  inflightSilent: boolean;
  cache: DaaAuthSessionResult | null;
  cacheSilent: boolean;
  cacheAt: number;
};

const DAA_AUTH_SESSION_RUNTIME_KEY = "__daa_auth_me_client_runtime_v1__";
const DAA_AUTH_SESSION_DEFAULT_CACHE_TTL_MS = 2_500;

function getRuntime(): RuntimeState {
  const g = globalThis as Record<string, unknown>;
  if (!g[DAA_AUTH_SESSION_RUNTIME_KEY]) {
    g[DAA_AUTH_SESSION_RUNTIME_KEY] = {
      inflight: null,
      inflightSilent: false,
      cache: null,
      cacheSilent: false,
      cacheAt: 0,
    } satisfies RuntimeState;
  }
  return g[DAA_AUTH_SESSION_RUNTIME_KEY] as RuntimeState;
}

function toErrorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object") {
    const message = typeof (value as { message?: unknown }).message === "string"
      ? (value as { message: string }).message.trim()
      : "";
    if (message) return message;
  }
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

async function requestAuthSession(silent: boolean): Promise<DaaAuthSessionResult> {
  const endpoint = silent ? "/api/daa/auth/me?silent=1" : "/api/daa/auth/me";
  try {
    const sessionResponse = await fetch(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const raw = await sessionResponse.json().catch(() => null);

    if (sessionResponse.status === 401) return { kind: "signedOut" };
    if (!isApiResponse(raw)) {
      return { kind: "error", message: `HTTP ${sessionResponse.status}` };
    }

    const json = raw as DaaAuthMeResponse;
    if (!json.ok && json.error.message === "not_authenticated") {
      return { kind: "signedOut" };
    }
    if (!sessionResponse.ok) {
      if (!json.ok) {
        return { kind: "error", message: toErrorMessage(json.error, `HTTP ${sessionResponse.status}`) };
      }
      return { kind: "error", message: `HTTP ${sessionResponse.status}` };
    }
    if (json.ok) {
      return { kind: "signedIn", me: json.data };
    }
    return { kind: "error", message: toErrorMessage(json.error, "auth session unavailable") };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchDaaAuthSession(input?: {
  silent?: boolean;
  force?: boolean;
  cacheTtlMs?: number;
}): Promise<DaaAuthSessionResult> {
  const silent = input?.silent !== false;
  const force = Boolean(input?.force);
  const ttlMs = Math.max(0, Math.trunc(Number(input?.cacheTtlMs ?? DAA_AUTH_SESSION_DEFAULT_CACHE_TTL_MS)) || 0);
  const runtime = getRuntime();
  const now = Date.now();

  if (!force && runtime.cache && runtime.cacheSilent === silent && now - runtime.cacheAt <= ttlMs) {
    return runtime.cache;
  }

  if (runtime.inflight && runtime.inflightSilent === silent) {
    return runtime.inflight;
  }

  const request = requestAuthSession(silent)
    .then((result) => {
      runtime.cache = result;
      runtime.cacheSilent = silent;
      runtime.cacheAt = Date.now();
      return result;
    })
    .finally(() => {
      if (runtime.inflight === request) {
        runtime.inflight = null;
      }
    });

  runtime.inflight = request;
  runtime.inflightSilent = silent;
  return request;
}

export function invalidateDaaAuthSessionCache(): void {
  const runtime = getRuntime();
  runtime.cache = null;
  runtime.cacheAt = 0;
}
