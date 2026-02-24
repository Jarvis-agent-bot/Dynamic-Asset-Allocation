import { NextResponse } from "next/server";

import { requireDaaFixtureSmokeGateV0 } from "@/src/daa/fixtureSmokeGateV0";

type ApiContractProbeItemV0 = {
  key: "engine-health" | "market" | "rebalance" | "store";
  route: string;
  method: "GET" | "POST";
  expected: string;
  body?: string;
};

type ApiContractProbeResultV0 = {
  key: ApiContractProbeItemV0["key"];
  route: string;
  method: ApiContractProbeItemV0["method"];
  expected: string;
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  timeoutMs: number;
  errorCode?: string;
  errorMessage?: string;
};

type ApiContractSmokeSummaryV1 = {
  total: number;
  pass: number;
  fail: number;
  passRatePct: number;
  failFast: boolean;
};

const DEFAULT_TIMEOUT_MS = 5_000;

const API_CONTRACT_SMOKE_ITEMS_V0: ApiContractProbeItemV0[] = [
  {
    key: "engine-health",
    route: "/api/daa/engine-health",
    method: "GET",
    expected: "engine health contract returns 200 json",
  },
  {
    key: "market",
    route: "/api/daa/market/yfinance/price-series?symbol=SPY&start=2025-01-02&end=2025-01-10",
    method: "GET",
    expected: "market endpoint returns yfinance series payload",
  },
  {
    key: "rebalance",
    route: "/api/daa/rebalance/simulate",
    method: "POST",
    expected: "rebalance simulate endpoint accepts v0 request",
    body: JSON.stringify({ money_plan: {}, signals: [] }),
  },
  {
    key: "store",
    route: "/api/daa/store/v0/runs?limit=1",
    method: "GET",
    expected: "store list endpoint remains queryable",
  },
];

function parsePositiveInt(input: string | null | undefined, fallback: number): number {
  const n = Number(String(input ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function getErrorDetails(payload: unknown): { errorCode?: string; errorMessage?: string } {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;

  const errorCode =
    typeof record.error === "string"
      ? record.error
      : typeof record.code === "string"
        ? record.code
        : undefined;

  const errorMessage =
    typeof record.message === "string"
      ? record.message
      : typeof record.description === "string"
        ? record.description
        : undefined;

  return { errorCode, errorMessage };
}

async function runProbe(
  req: Request,
  probe: ApiContractProbeItemV0,
  timeoutMs: number,
): Promise<ApiContractProbeResultV0> {
  const startedAt = Date.now();
  const url = new URL(probe.route, req.url);
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(new Error(`timeout:${timeoutMs}`)), timeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
    };

    const cookie = req.headers.get("cookie");
    if (cookie) headers.cookie = cookie;

    const auth = req.headers.get("authorization");
    if (auth) headers.authorization = auth;

    if (probe.method === "POST") headers["content-type"] = "application/json";

    const res = await fetch(url, {
      method: probe.method,
      headers,
      body: probe.body,
      cache: "no-store",
      signal: ac.signal,
    });

    const latencyMs = Date.now() - startedAt;
    const raw = await res.text();
    let payload: unknown;

    try {
      payload = raw ? JSON.parse(raw) : undefined;
    } catch {
      payload = { message: raw.slice(0, 500) };
    }

    if (!res.ok) {
      const details = getErrorDetails(payload);
      return {
        key: probe.key,
        route: probe.route,
        method: probe.method,
        expected: probe.expected,
        ok: false,
        statusCode: res.status,
        latencyMs,
        timeoutMs,
        errorCode: details.errorCode ?? `http_${res.status}`,
        errorMessage: details.errorMessage ?? `probe failed with http ${res.status}`,
      };
    }

    return {
      key: probe.key,
      route: probe.route,
      method: probe.method,
      expected: probe.expected,
      ok: true,
      statusCode: res.status,
      latencyMs,
      timeoutMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout = msg.startsWith("timeout:") || ac.signal.aborted;

    return {
      key: probe.key,
      route: probe.route,
      method: probe.method,
      expected: probe.expected,
      ok: false,
      statusCode: 0,
      latencyMs,
      timeoutMs,
      errorCode: isTimeout ? "timeout" : "fetch_error",
      errorMessage: msg,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(req: Request) {
  const denied = await requireDaaFixtureSmokeGateV0(req, "smoke");
  if (denied) return denied;

  const timeoutMs = parsePositiveInt(process.env.DAA_API_CONTRACT_SMOKE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const checks: ApiContractProbeResultV0[] = [];

  for (const probe of API_CONTRACT_SMOKE_ITEMS_V0) {
    const result = await runProbe(req, probe, timeoutMs);
    checks.push(result);
    if (!result.ok) break;
  }

  const total = API_CONTRACT_SMOKE_ITEMS_V0.length;
  const pass = checks.filter((item) => item.ok).length;
  const fail = Math.max(0, checks.length - pass);
  const summary: ApiContractSmokeSummaryV1 = {
    total,
    pass,
    fail,
    passRatePct: total > 0 ? Math.round((pass / total) * 100) : 0,
    failFast: fail > 0,
  };

  const statusTag = fail === 0 ? "PASS" : "FAIL";

  return NextResponse.json(
    {
      ok: fail === 0,
      smoke: "nextjs-api-contract-v7-real-probes",
      summaryLine: `[DAA][ApiContractSmoke] ${statusTag} ${pass}/${total} checks (${summary.passRatePct}%)`,
      timeoutMs,
      summary,
      checks,
    },
    { status: fail === 0 ? 200 : 502 },
  );
}
