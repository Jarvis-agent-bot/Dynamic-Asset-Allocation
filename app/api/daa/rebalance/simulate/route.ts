import { NextResponse } from "next/server";

import type { RebalanceSimulateRequest } from "@/src/daa/engineContracts";
import { proxyToEngine } from "@/src/daa/proxyToEngine";
import { readJsonBody } from "@/src/daa/requestJson";

// Single purpose: provide a stable Next.js API endpoint that proxies to the Python engine
// behind nginx (/daa-api/...). This keeps the UI independent from deployment routing.

export async function POST(req: Request) {
  const parsed = await readJsonBody<RebalanceSimulateRequest>(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const timeoutMs = Number(process.env.DAA_ENGINE_TIMEOUT_MS || 30_000);

  // Pass through raw text to avoid coupling to engine request shape.
  return proxyToEngine({
    upstreamPath: "/daa-api/v1/rebalance/simulate",
    method: "POST",
    bodyText: parsed.rawText,
    contentType: "application/json",
    timeoutMs,
    fallbackContentType: "application/json",
  });
}
