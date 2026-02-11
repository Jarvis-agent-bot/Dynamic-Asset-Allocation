import { NextResponse } from "next/server";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`missing env: ${name}`);
  return v.trim();
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Resolve a Twitter user by screen name via pro.twitterdata.com.
// Token MUST stay server-side (env) to avoid leaking to the browser.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const screenName = url.searchParams.get("screenName")?.trim();

    if (!screenName) {
      return json({ error: "missing screenName" }, { status: 400 });
    }

    const token = mustGetEnv("TWITTERDATA_TOKEN");
    const upstream = new URL("https://pro.twitterdata.com/UserByScreenName");
    upstream.searchParams.set("screenName", screenName);
    upstream.searchParams.set("token", token);

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

    return json({ ok: true, source: "twitterdata", screenName, payload });
  } catch (e) {
    return json(
      {
        error: "twitter user resolve failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
