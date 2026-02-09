import { proxyToEngine } from "@/src/daa/proxyToEngine";

// Health passthrough for the Python engine behind nginx (/daa-api/...).
export async function GET() {
  const timeoutMs = Number(process.env.DAA_ENGINE_TIMEOUT_MS || 10_000);

  return proxyToEngine({
    upstreamPath: "/daa-api/health",
    method: "GET",
    timeoutMs,
    fallbackContentType: "text/plain; charset=utf-8",
  });
}
