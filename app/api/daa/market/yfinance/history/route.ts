import { NextResponse } from "next/server";

import { parsePositiveIntEnv } from "@/src/daa/env";
import { proxyToEngineJson } from "@/src/daa/proxyToEngine";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Proxy yfinance history via the Python engine behind nginx (/daa-api/...).
// Example:
//   /api/daa/market/yfinance/history?symbol=SPY&start=2026-01-01&end=2026-02-01&interval=1d
export async function GET(req: Request) {
  const url = new URL(req.url);

  const symbol = url.searchParams.get("symbol")?.trim();
  if (!symbol) return json({ error: "missing symbol" }, { status: 400 });

  const qs = new URLSearchParams();
  qs.set("symbol", symbol);

  const start = url.searchParams.get("start")?.trim();
  const end = url.searchParams.get("end")?.trim();
  const interval = url.searchParams.get("interval")?.trim();

  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  if (interval) qs.set("interval", interval);

  const timeoutMs = parsePositiveIntEnv("DAA_ENGINE_TIMEOUT_MS", 30_000);

  return proxyToEngineJson({
    upstreamPath: `/daa-api/v1/market/yfinance/history?${qs.toString()}`,
    method: "GET",
    timeoutMs,
    fallbackContentType: "application/json",
    abortSignal: req.signal,
  });
}
