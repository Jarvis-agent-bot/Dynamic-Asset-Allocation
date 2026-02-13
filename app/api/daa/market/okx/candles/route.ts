import { NextResponse } from "next/server";

import { normalizeOkxCandlesPayload } from "@/src/market/okx";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// OKX public market candles (server-side) to avoid browser CORS.
// Example: /api/daa/market/okx/candles?instId=BTC-USDT&bar=1D&start=2026-01-01&end=2026-02-01
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const instId = url.searchParams.get("instId")?.trim();
    if (!instId) return json({ error: "missing instId" }, { status: 400 });

    const bar = url.searchParams.get("bar")?.trim() || "1D";
    const start = url.searchParams.get("start")?.trim() || undefined;
    const end = url.searchParams.get("end")?.trim() || undefined;

    const limitRaw = Number(url.searchParams.get("limit") ?? "300");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(300, Math.floor(limitRaw))) : 300;

    const upstream = new URL("https://www.okx.com/api/v5/market/candles");
    upstream.searchParams.set("instId", instId);
    upstream.searchParams.set("bar", bar);
    upstream.searchParams.set("limit", String(limit));

    // Best-effort: if `end` is provided, anchor the upstream query near that day.
    // OKX pagination semantics can vary by endpoint; we keep this optional and non-fatal.
    if (end) {
      const endMs = Date.parse(`${end}T23:59:59.999Z`);
      if (Number.isFinite(endMs)) {
        upstream.searchParams.set("before", String(endMs + 1));
      }
    }

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
          error: "okx upstream error",
          status: r.status,
          body: text.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (payload && typeof payload === "object" && String(payload.code ?? "") && String(payload.code) !== "0") {
      return json(
        {
          error: "okx error response",
          code: payload.code,
          msg: payload.msg,
        },
        { status: 502 },
      );
    }

    const normalized = normalizeOkxCandlesPayload(payload, { start, end });

    return json({
      ok: true,
      source: "okx",
      instId,
      bar,
      limit,
      rawCount: Array.isArray(payload?.data) ? payload.data.length : 0,
      series: normalized.series,
      issues: normalized.issues,
    });
  } catch (e) {
    return json(
      {
        error: "okx candles fetch failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
