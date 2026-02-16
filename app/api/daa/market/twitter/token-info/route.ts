import { NextResponse } from "next/server";

import { fetchTextWithTimeoutV0, mustGetEnvV0 } from "../../_lib/providerAdaptersV0";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Fetch token usage info via pro.twitterdata.com/tokenInfo.
// Token MUST stay server-side (env) to avoid leaking to the browser.
export async function GET() {
  try {
    const token = mustGetEnvV0("TWITTERDATA_TOKEN");
    const upstream = new URL("https://pro.twitterdata.com/tokenInfo");
    upstream.searchParams.set("token", token);

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

    // Ensure we never return the actual token to the browser.
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const copy: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
      if (typeof copy.token === "string") copy.token = "REDACTED";
      payload = copy;
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
