import { NextResponse } from "next/server";

import { fetchTextWithTimeoutV0, getProviderErrorStatusV0, mustGetEnvV0, parseXueqiuCookieV0 } from "../../_lib/providerAdaptersV0";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Fetch realtime quote from Xueqiu v5 quotec endpoint.
// Auth is provided via a minimal cookie string (xq_a_token + u) in env.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.trim();
    if (!symbol) {
      return json({ error: "missing symbol" }, { status: 400 });
    }

    // Expected format: "xq_a_token=...;u=..." (pysnowball-compatible)
    const cookie = parseXueqiuCookieV0(mustGetEnvV0("XUEQIU_TOKEN"));

    const upstream = new URL("https://stock.xueqiu.com/v5/stock/realtime/quotec.json");
    upstream.searchParams.set("symbol", symbol);
    upstream.searchParams.set("_", String(Date.now()));

    const r = await fetchTextWithTimeoutV0(upstream, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        cookie,
        origin: "https://xueqiu.com",
        referer: `https://xueqiu.com/S/${symbol}`,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });

    const text = await r.text();
    if (!r.ok) {
      return json(
        {
          error: "xueqiu upstream error",
          status: r.status,
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

    return json({ ok: true, source: "xueqiu", symbol, payload });
  } catch (e) {
    return json(
      {
        error: "xueqiu quotec fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: getProviderErrorStatusV0(e) },
    );
  }
}
