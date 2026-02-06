import { NextResponse } from "next/server";

// Single purpose: provide a stable Next.js API endpoint that proxies to the Python engine
// behind nginx (/daa-api/...). This keeps the UI independent from deployment routing.

export async function POST(req: Request) {
  const upstreamPath = "/daa-api/v1/rebalance/simulate";

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ error: "failed to read request body" }, { status: 400 });
  }

  // Prefer absolute base URL when provided (useful for local dev), otherwise same-origin.
  const base = process.env.DAA_ENGINE_BASE_URL?.replace(/\/$/, "") || "";
  const url = `${base}${upstreamPath}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: bodyText,
    // Next.js runtime caches fetch by default in some contexts; this is a pure proxy.
    cache: "no-store",
  });

  const text = await resp.text();

  // Pass through raw text to avoid coupling to engine response shape.
  return new NextResponse(text, {
    status: resp.status,
    headers: {
      "content-type": resp.headers.get("content-type") || "application/json",
    },
  });
}
