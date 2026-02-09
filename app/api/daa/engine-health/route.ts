import { proxyToEngine } from "@/src/daa/proxyToEngine";
import { parsePositiveIntEnv } from "@/src/daa/env";

// Health passthrough for the Python engine behind nginx (/daa-api/...).
// Contract: src/core/contracts/daaEngine.ts
export async function GET() {
  const timeoutMs = parsePositiveIntEnv("DAA_ENGINE_TIMEOUT_MS", 10_000);

  return proxyToEngine({
    upstreamPath: "/daa-api/health",
    method: "GET",
    timeoutMs,
    fallbackContentType: "text/plain; charset=utf-8",
  });
}
