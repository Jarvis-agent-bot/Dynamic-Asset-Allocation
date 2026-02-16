import { NextResponse } from "next/server";

import { clampLimitV0, fetchTextWithTimeoutV0, getProviderErrorStatusV0, mustGetEnvV0 } from "../../_lib/providerAdaptersV0";

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
    const limit = clampLimitV0(url.searchParams.get("limit"));

    if (!restId) {
      return json({ error: "missing restId" }, { status: 400 });
    }

    const token = mustGetEnvV0("TWITTERDATA_TOKEN");
    const endpoint = includeReplies ? "UserTweetsAndReplies" : "UserTweets";
    const upstream = new URL(`https://pro.twitterdata.com/${endpoint}`);
    upstream.searchParams.set("restId", restId);
    upstream.searchParams.set("token", token);
    if (cursor) upstream.searchParams.set("cursor", cursor);
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
      { status: getProviderErrorStatusV0(e) },
    );
  }
}
