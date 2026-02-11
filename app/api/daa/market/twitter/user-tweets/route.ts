import { NextResponse } from "next/server";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`missing env: ${name}`);
  return v.trim();
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Fetch tweets (or tweets+replies) for a user via pro.twitterdata.com.
// Token MUST stay server-side (env) to avoid leaking to the browser.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const restId = url.searchParams.get("restId")?.trim();
    const includeReplies = (url.searchParams.get("includeReplies") ?? "").trim() === "1";
    const cursor = url.searchParams.get("cursor")?.trim() || "";
    const limit = Number(url.searchParams.get("limit") ?? "50");

    if (!restId) {
      return json({ error: "missing restId" }, { status: 400 });
    }

    const token = mustGetEnv("TWITTERDATA_TOKEN");
    const endpoint = includeReplies ? "UserTweetsAndReplies" : "UserTweets";
    const upstream = new URL(`https://pro.twitterdata.com/${endpoint}`);
    upstream.searchParams.set("restId", restId);
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

    return json({ ok: true, source: "twitterdata", restId, includeReplies, cursor: cursor || null, payload });
  } catch (e) {
    return json(
      {
        error: "twitter user tweets fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
