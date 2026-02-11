import { NextResponse } from "next/server";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`missing env: ${name}`);
  return v.trim();
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Search Twitter via pro.twitterdata.com/SearchTimeline.
// Token MUST stay server-side (env) to avoid leaking to the browser.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawQuery = url.searchParams.get("rawQuery")?.trim();
    const cursor = url.searchParams.get("cursor")?.trim() || "";
    const limit = Number(url.searchParams.get("limit") ?? "50");

    if (!rawQuery) {
      return json({ error: "missing rawQuery" }, { status: 400 });
    }

    const token = mustGetEnv("TWITTERDATA_TOKEN");
    const upstream = new URL("https://pro.twitterdata.com/SearchTimeline");
    upstream.searchParams.set("rawQuery", rawQuery);
    upstream.searchParams.set("token", token);
    if (cursor) upstream.searchParams.set("cursor", cursor);
    if (Number.isFinite(limit) && limit > 0) upstream.searchParams.set("limit", String(Math.min(200, Math.trunc(limit))));

    const r = await fetch(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
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

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    return json({ ok: true, source: "twitterdata", rawQuery, cursor: cursor || null, payload });
  } catch (e) {
    return json(
      {
        error: "twitter search fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
