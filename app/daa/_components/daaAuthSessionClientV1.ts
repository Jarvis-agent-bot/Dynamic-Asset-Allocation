"use client";

import { isApiResponseV1, type ApiResponseV1 } from "@/src/daa/api/contractsV1";

export type DaaAuthMePayloadV1 = {
  account: { accountId: string; username: string; roles: string[]; status: string };
  session: {
    sessionId: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    lastSeenAt: string | null;
  };
};

export type DaaAuthMeResponseV1 = ApiResponseV1<DaaAuthMePayloadV1>;

export type DaaAuthSessionResultV1 =
  | { kind: "signedIn"; me: DaaAuthMePayloadV1 }
  | { kind: "signedOut" }
  | { kind: "error"; message: string };

type RuntimeStateV1 = {
  inflight: Promise<DaaAuthSessionResultV1> | null;
  inflightSilent: boolean;
  cache: DaaAuthSessionResultV1 | null;
  cacheSilent: boolean;
  cacheAt: number;
};

const RUNTIME_KEY_V1 = "__daa_auth_me_client_runtime_v1__";
const DEFAULT_CACHE_TTL_MS_V1 = 2_500;

function getRuntimeV1(): RuntimeStateV1 {
  const g = globalThis as Record<string, unknown>;
  if (!g[RUNTIME_KEY_V1]) {
    g[RUNTIME_KEY_V1] = {
      inflight: null,
      inflightSilent: false,
      cache: null,
      cacheSilent: false,
      cacheAt: 0,
    } satisfies RuntimeStateV1;
  }
  return g[RUNTIME_KEY_V1] as RuntimeStateV1;
}

function toErrorMessageV1(value: unknown, fallback: string): string {
  if (value && typeof value === "object") {
    const message = typeof (value as { message?: unknown }).message === "string"
      ? (value as { message: string }).message.trim()
      : "";
    if (message) return message;
  }
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

async function requestAuthSessionV1(silent: boolean): Promise<DaaAuthSessionResultV1> {
  const endpoint = silent ? "/api/daa/auth/me?silent=1" : "/api/daa/auth/me";
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const raw = await res.json().catch(() => null);

    if (res.status === 401) return { kind: "signedOut" };
    if (!isApiResponseV1(raw)) {
      return { kind: "error", message: `HTTP ${res.status}` };
    }

    const json = raw as DaaAuthMeResponseV1;
    if (!json.ok && json.error.message === "not_authenticated") {
      return { kind: "signedOut" };
    }
    if (!res.ok) {
      if (!json.ok) {
        return { kind: "error", message: toErrorMessageV1(json.error, `HTTP ${res.status}`) };
      }
      return { kind: "error", message: `HTTP ${res.status}` };
    }
    if (json.ok) {
      return { kind: "signedIn", me: json.data };
    }
    return { kind: "error", message: toErrorMessageV1(json.error, "auth session unavailable") };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchDaaAuthSessionV1(input?: {
  silent?: boolean;
  force?: boolean;
  cacheTtlMs?: number;
}): Promise<DaaAuthSessionResultV1> {
  const silent = input?.silent !== false;
  const force = Boolean(input?.force);
  const ttlMs = Math.max(0, Math.trunc(Number(input?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS_V1)) || 0);
  const runtime = getRuntimeV1();
  const now = Date.now();

  if (!force && runtime.cache && runtime.cacheSilent === silent && now - runtime.cacheAt <= ttlMs) {
    return runtime.cache;
  }

  if (runtime.inflight && runtime.inflightSilent === silent) {
    return runtime.inflight;
  }

  const request = requestAuthSessionV1(silent)
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

export function invalidateDaaAuthSessionCacheV1(): void {
  const runtime = getRuntimeV1();
  runtime.cache = null;
  runtime.cacheAt = 0;
}
