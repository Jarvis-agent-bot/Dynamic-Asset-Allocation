import { NextResponse } from "next/server";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`missing env: ${name}`);
  return v.trim();
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Fetch tweets from a Twitter Community timeline via pro.twitterdata.com.
// Token MUST stay server-side (env) to avoid leaking to the browser.
//
// Note: twitterdata's community timeline API is cursor-paginated.
// We intentionally keep the upstream response raw and let the Step2 UI normalize.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const communityId = url.searchParams.get("communityId")?.trim();
    const cursor = url.searchParams.get("cursor")?.trim() || "";
    const limit = Number(url.searchParams.get("limit") ?? "50");

    if (!communityId) {
      return json({ error: "missing communityId" }, { status: 400 });
    }

    const token = mustGetEnv("TWITTERDATA_TOKEN");

    // twitterdata doesn't publicly document all endpoints in one place.
    // Allow overriding the endpoint name for quick fixes without code changes.
    const endpoint = (process.env.TWITTERDATA_COMMUNITY_ENDPOINT || "CommunityTweetsTimeline").trim();
    const upstream = new URL(`https://pro.twitterdata.com/${endpoint}`);

    upstream.searchParams.set("communityId", communityId);
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

    const text = await r.text();
    if (!r.ok) {
      return json(
        {
          error: "twitterdata upstream error",
          status: r.status,
          body: text.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    return json({ ok: true, source: "twitterdata", communityId, cursor: cursor || null, payload });
  } catch (e) {
    return json(
      {
        error: "twitter community fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
