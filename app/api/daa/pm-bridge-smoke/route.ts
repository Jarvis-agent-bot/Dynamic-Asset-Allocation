import { NextResponse } from "next/server";

import { isDaaEngineRebalanceSimulateResponse } from "@/src/core/contracts/daaEngine";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { parsePositiveIntEnv } from "@/src/daa/env";
import { proxyToEngineJson } from "@/src/daa/proxyToEngine";

const PM_BRIDGE_SMOKE_REQUEST_V0 = {
  money_plan: {
    account: {
      baseCcy: "CNY",
      totalEquity: 100000,
      cash: 20000,
      investable: 80000,
    },
    constraints: {
      maxPositionPct: 0.2,
      maxIn: 10000,
      maxOut: 10000,
    },
    allocations: [
      { id: "AAA", label: "AAA", targetPct: 0.1 },
      { id: "BBB", label: "BBB", targetPct: 0.1 },
      { id: "CCC", label: "CCC", targetPct: 0.1 },
    ],
  },
  signals: [
    { symbol: "AAA", action: "BUY", score: 0.86, reason: "pm-bridge smoke admit buy" },
    { symbol: "BBB", action: "SELL", score: 0.82, reason: "pm-bridge smoke admit sell" },
    { symbol: "CCC", action: "HOLD", score: 0.45, reason: "pm-bridge smoke hold path" },
  ],
} as const;

export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const timeoutMs = parsePositiveIntEnv("DAA_ENGINE_TIMEOUT_MS", 30_000);

  const upstream = await proxyToEngineJson({
    upstreamPath: "/daa-api/v1/rebalance/simulate",
    method: "POST",
    bodyText: JSON.stringify(PM_BRIDGE_SMOKE_REQUEST_V0),
    contentType: "application/json",
    timeoutMs,
    fallbackContentType: "application/json",
    abortSignal: req.signal,
    validate: isDaaEngineRebalanceSimulateResponse,
  });

  if (!upstream.ok) return upstream;

  let payload: any = null;
  try {
    payload = await upstream.json();
  } catch {
    return NextResponse.json({ ok: false, error: "pm bridge smoke invalid json" }, { status: 502 });
  }

  const orders = Array.isArray(payload?.orders) ? payload.orders : [];
  const admittedSignals = orders.length;
  const totalSignals = PM_BRIDGE_SMOKE_REQUEST_V0.signals.length;

  return NextResponse.json({
    ok: true,
    smoke: "pm-bridge-proposal-admission-v0",
    totalSignals,
    admittedSignals,
    rejectedSignals: Math.max(0, totalSignals - admittedSignals),
    orders,
    warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
  });
}
