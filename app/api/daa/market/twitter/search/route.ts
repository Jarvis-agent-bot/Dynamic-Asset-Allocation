import { NextResponse } from "next/server";

import { clampLimitV0, fetchTextWithTimeoutV0, getProviderErrorStatusV0, mustGetEnvV0 } from "../../_lib/providerAdaptersV0";

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
    const limit = clampLimitV0(url.searchParams.get("limit"));

    if (!rawQuery) {
      return json({ error: "missing rawQuery" }, { status: 400 });
    }

    const token = mustGetEnvV0("TWITTERDATA_TOKEN");
    const upstream = new URL("https://pro.twitterdata.com/SearchTimeline");
    upstream.searchParams.set("rawQuery", rawQuery);
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

    return json({ ok: true, source: "twitterdata", rawQuery, cursor: cursor || null, payload });
  } catch (e) {
    return json(
      {
        error: "twitter search fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: getProviderErrorStatusV0(e) },
    );
  }
}
