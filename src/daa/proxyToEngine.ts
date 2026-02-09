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
function isAbortError(e: unknown): boolean {
  // In Node/undici this is usually a DOMException named "AbortError".
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).name === "AbortError"
  );
}

export async function proxyToEngine(opts: ProxyToEngineOptions): Promise<Response> {
  const baseRaw = process.env.DAA_ENGINE_BASE_URL;
  if (!baseRaw) {
    // Avoid trying to fetch a relative URL (e.g. "/daa-api/..."), which fails in Node.
    return NextResponse.json(
      {
        error: "missing DAA_ENGINE_BASE_URL",
        message: "Set DAA_ENGINE_BASE_URL (e.g. https://your-domain.com) to reach the Python engine behind nginx.",
        upstreamPath: opts.upstreamPath,
      },
      { status: 500 },
    );
  }

  const base = baseRaw.replace(/\/$/, "");
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
    if (isAbortError(e)) {
      return NextResponse.json(
        { error: "upstream timeout", upstream: url, timeoutMs: opts.timeoutMs },
        { status: 504 },
      );
    }

    const msg = e instanceof Error ? e.message : "unknown fetch error";
    return NextResponse.json(
      { error: "upstream fetch failed", upstream: url, message: msg },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await resp.text();

  // Pass through upstream headers (e.g. set-cookie) while ensuring a stable content-type.
  const headers = new Headers(resp.headers);
  if (!headers.get("content-type")) headers.set("content-type", opts.fallbackContentType);

  return new Response(text, {
    status: resp.status,
    headers,
  });
}

export type ProxyToEngineJsonOptions<T> = ProxyToEngineOptions & {
  validate?: (v: unknown) => v is T;
};

export async function proxyToEngineJson<T>(opts: ProxyToEngineJsonOptions<T>): Promise<Response> {
  const baseRaw = process.env.DAA_ENGINE_BASE_URL;
  if (!baseRaw) {
    return NextResponse.json(
      {
        error: "missing DAA_ENGINE_BASE_URL",
        message: "Set DAA_ENGINE_BASE_URL (e.g. https://your-domain.com) to reach the Python engine behind nginx.",
        upstreamPath: opts.upstreamPath,
      },
      { status: 500 },
    );
  }

  const base = baseRaw.replace(/\/$/, "");
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
    if (isAbortError(e)) {
      return NextResponse.json(
        { ok: false, error: "upstream timeout", upstream: url, timeoutMs: opts.timeoutMs },
        { status: 504 },
      );
    }

    const msg = e instanceof Error ? e.message : "unknown fetch error";
    return NextResponse.json(
      { ok: false, error: "upstream fetch failed", upstream: url, message: msg },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await resp.text();
  let json: unknown;
  try {
    json = text.length ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid upstream json", upstream: url, status: resp.status },
      { status: 502 },
    );
  }

  if (opts.validate && !opts.validate(json)) {
    return NextResponse.json(
      { ok: false, error: "upstream response contract mismatch", upstream: url, status: resp.status },
      { status: 502 },
    );
  }

  return NextResponse.json(json, { status: resp.status });
}
