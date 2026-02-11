import { NextResponse } from "next/server";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`missing env: ${name}`);
  return v.trim();
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Fetch token usage info via pro.twitterdata.com/tokenInfo.
// Token MUST stay server-side (env) to avoid leaking to the browser.
export async function GET() {
  try {
    const token = mustGetEnv("TWITTERDATA_TOKEN");
    const upstream = new URL("https://pro.twitterdata.com/tokenInfo");
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

    return json({ ok: true, source: "twitterdata", payload });
  } catch (e) {
    return json(
      {
        error: "twitter tokenInfo fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
