import { NextResponse } from "next/server";

// Health passthrough for the Python engine behind nginx (/daa-api/...).
export async function GET() {
  const upstreamPath = "/daa-api/health";

  const base = process.env.DAA_ENGINE_BASE_URL?.replace(/\/$/, "") || "";
  const url = `${base}${upstreamPath}`;

  const controller = new AbortController();
  const timeoutMs = Number(process.env.DAA_ENGINE_TIMEOUT_MS || 10_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const text = await resp.text();

    return new NextResponse(text, {
      status: resp.status,
      headers: {
        "content-type": resp.headers.get("content-type") || "text/plain; charset=utf-8",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown fetch error";
    return NextResponse.json({ error: "upstream fetch failed", upstream: url, message: msg }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
