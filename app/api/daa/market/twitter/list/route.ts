import { NextResponse } from "next/server";

import { clampLimitV0, fetchTextWithTimeoutV0, getProviderErrorStatusV0, mustGetEnvV0 } from "../../_lib/providerAdaptersV0";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Fetch latest tweets from a Twitter List via pro.twitterdata.com.
// Token MUST stay server-side (env) to avoid leaking to the browser.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const listId = url.searchParams.get("listId")?.trim();
    const limit = clampLimitV0(url.searchParams.get("limit"));

    if (!listId) {
      return json({ error: "missing listId" }, { status: 400 });
    }

    const token = mustGetEnvV0("TWITTERDATA_TOKEN");
    const upstream = new URL("https://pro.twitterdata.com/ListLatestTweetsTimeline");
    upstream.searchParams.set("listId", listId);
    upstream.searchParams.set("token", token);
    upstream.searchParams.set("limit", String(limit));

    const r = await fetchTextWithTimeoutV0(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    if (!r.ok) {
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
      { status: getProviderErrorStatusV0(e) },
    );
  }
}
