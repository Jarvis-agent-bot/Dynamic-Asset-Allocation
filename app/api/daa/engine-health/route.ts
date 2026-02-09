import { isDaaEngineHealthResponse } from "@/src/core/contracts/daaEngine";
import { proxyToEngineJson } from "@/src/daa/proxyToEngine";
import { parsePositiveIntEnv } from "@/src/daa/env";

// Health proxy for the Python engine behind nginx (/daa-api/...).
// Enforces the v0 contract to catch accidental drift early.
export async function GET() {
  const timeoutMs = parsePositiveIntEnv("DAA_ENGINE_TIMEOUT_MS", 10_000);

  return proxyToEngineJson({
    upstreamPath: "/daa-api/health",
    method: "GET",
    timeoutMs,
    fallbackContentType: "application/json",
    validate: isDaaEngineHealthResponse,
  });
}
