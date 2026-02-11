import { NextResponse } from "next/server";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`missing env: ${name}`);
  return v.trim();
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Fetch latest tweets from a Twitter List via pro.twitterdata.com.
// Token MUST stay server-side (env) to avoid leaking to the browser.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const listId = url.searchParams.get("listId")?.trim();
    const limit = Number(url.searchParams.get("limit") ?? "50");

    if (!listId) {
      return json({ error: "missing listId" }, { status: 400 });
    }

    const token = mustGetEnv("TWITTERDATA_TOKEN");
    const upstream = new URL("https://pro.twitterdata.com/ListLatestTweetsTimeline");
    upstream.searchParams.set("listId", listId);
    upstream.searchParams.set("token", token);
    if (Number.isFinite(limit) && limit > 0) upstream.searchParams.set("limit", String(Math.min(200, Math.trunc(limit))));

    const r = await fetch(upstream, {
      method: "GET",
      // Best-effort headers; upstream might not require them.
      headers: {
        accept: "application/json",
      },
      // Avoid caching sensitive requests.
      cache: "no-store",
    });

    if (!r.ok) {
      // Avoid returning upstream bodies: they may contain the token (query param) in error text.
      return json(
        {
          error: "twitterdata upstream error",
          status: r.status,
        },
        { status: 502 },
      );
    }

    const text = await r.text();

    // We intentionally keep the upstream response raw.
    // The Step2 UI normalizer accepts multiple shapes.
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    return json({ ok: true, source: "twitterdata", listId, payload });
  } catch (e) {
    return json(
      {
        error: "twitter list fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
