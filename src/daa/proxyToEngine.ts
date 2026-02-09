import { NextResponse } from "next/server";

export type ProxyToEngineOptions = {
  upstreamPath: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  bodyText?: string;
  contentType?: string;
  timeoutMs: number;
  fallbackContentType: string;
};

// Shared proxy logic for Next.js routes that forward requests to the Python engine behind nginx.
export async function proxyToEngine(opts: ProxyToEngineOptions): Promise<Response> {
  const base = process.env.DAA_ENGINE_BASE_URL?.replace(/\/$/, "") || "";
  const url = `${base}${opts.upstreamPath}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: opts.method,
      headers: opts.contentType ? { "content-type": opts.contentType } : undefined,
      body: opts.bodyText,
      signal: controller.signal,
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
  const contentType = resp.headers.get("content-type") || opts.fallbackContentType;

  return new Response(text, {
    status: resp.status,
    headers: { "content-type": contentType },
  });
}
