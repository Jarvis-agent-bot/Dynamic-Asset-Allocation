import { NextResponse } from "next/server";

import { isRebalanceSimulateRequest, type RebalanceSimulateRequest } from "@/src/daa/engineContracts";
import { readJsonBody } from "@/src/daa/requestJson";

// Single purpose: provide a stable Next.js API endpoint that proxies to the Python engine
// behind nginx (/daa-api/...). This keeps the UI independent from deployment routing.

export async function POST(req: Request) {
  const upstreamPath = "/daa-api/v1/rebalance/simulate";

  const parsed = await readJsonBody<RebalanceSimulateRequest>(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isRebalanceSimulateRequest(parsed.value)) {
    return NextResponse.json(
      { error: "invalid request shape", expected: "{ money_plan: ..., signals: ... }" },
      { status: 400 },
    );
  }

  // Prefer absolute base URL when provided (useful for local dev), otherwise same-origin.
  const base = process.env.DAA_ENGINE_BASE_URL?.replace(/\/$/, "") || "";
  const url = `${base}${upstreamPath}`;

  const controller = new AbortController();
  const timeoutMs = Number(process.env.DAA_ENGINE_TIMEOUT_MS || 30_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: parsed.rawText,
      signal: controller.signal,
      // Next.js runtime caches fetch by default in some contexts; this is a pure proxy.
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown fetch error";
    return NextResponse.json(
      { error: "upstream fetch failed", upstream: url, message: msg },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await resp.text();

  // Pass through raw text to avoid coupling to engine response shape.
  return new NextResponse(text, {
    status: resp.status,
    headers: {
      "content-type": resp.headers.get("content-type") || "application/json",
    },
  });
}
