import { NextResponse } from "next/server";

import { isDaaEngineRebalanceSimulateResponse } from "@/src/core/contracts/daaEngine";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { isRebalanceSimulateRequest, type RebalanceSimulateRequest } from "@/src/daa/engineContracts";
import { proxyToEngineJson } from "@/src/daa/proxyToEngine";
import { readJsonBody } from "@/src/daa/requestJson";
import { parsePositiveIntEnv } from "@/src/daa/env";

// Single purpose: provide a stable Next.js API endpoint that proxies to the Python engine
// behind nginx (/daa-api/...). This keeps the UI independent from deployment routing.

export async function POST(req: Request) {
  const denied = requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const parsed = await readJsonBody<RebalanceSimulateRequest>(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (!isRebalanceSimulateRequest(parsed.value)) {
    return NextResponse.json(
      { error: "invalid request shape", expected: "{ money_plan: ..., signals: ... }" },
      { status: 400 },
    );
  }

  const timeoutMs = parsePositiveIntEnv("DAA_ENGINE_TIMEOUT_MS", 30_000);

  // Validate upstream response is JSON and roughly matches the v0 contract.
  return proxyToEngineJson({
    upstreamPath: "/daa-api/v1/rebalance/simulate",
    method: "POST",
    bodyText: parsed.rawText,
    contentType: "application/json",
    timeoutMs,
    fallbackContentType: "application/json",
    abortSignal: req.signal,
    validate: isDaaEngineRebalanceSimulateResponse,
  });
}
