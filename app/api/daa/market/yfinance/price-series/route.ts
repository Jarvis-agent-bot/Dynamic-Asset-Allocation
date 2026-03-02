import { NextResponse } from "next/server";

import { assertIsoDateString } from "@/src/core/isoDate";
import { addDaysIsoUtc, normalizeYfinanceHistoricalQuotes, normalizeYfinanceSymbol } from "@/src/market/yfinance";

export const runtime = "nodejs";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function epochSecondsUtcStart(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00.000Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
}

/**
 * Yahoo Finance daily historical bars via the public chart endpoint.
 *
 * This is effectively what many "yfinance"-style clients use under the hood, but
 * called server-side to avoid browser CORS.
 *
 * Example: /api/daa/market/yfinance/price-series?symbol=SPY&start=2026-01-01&end=2026-02-01
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbolRaw = url.searchParams.get("symbol")?.trim();
    if (!symbolRaw) return json({ ok: false, error: "missing symbol" }, { status: 400 });

    const start = url.searchParams.get("start")?.trim() || undefined;
    const end = url.searchParams.get("end")?.trim() || undefined;
    const adjustedRaw = url.searchParams.get("adjusted")?.trim();
    const useAdjustedClose = !(
      adjustedRaw === "0" ||
      adjustedRaw?.toLowerCase() === "false"
    );

    if (start !== undefined) assertIsoDateString(start, "start");
    if (end !== undefined) assertIsoDateString(end, "end");
    if (start && end && end < start) {
      return json({ ok: false, error: "end must be >= start", start, end }, { status: 400 });
    }

    const symbol = normalizeYfinanceSymbol(symbolRaw);
    if (!symbol) return json({ ok: false, error: "invalid symbol" }, { status: 400 });

    // Chart endpoint uses [period1, period2) in epoch seconds.
    const period1 = start ? epochSecondsUtcStart(start) : NaN;
    const endExclusiveIso = end ? addDaysIsoUtc(end, 1) : "";
    const period2 = endExclusiveIso ? epochSecondsUtcStart(endExclusiveIso) : NaN;

    const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    upstream.searchParams.set("interval", "1d");
    upstream.searchParams.set("events", "div|split");
    if (start) upstream.searchParams.set("period1", String(period1));
    if (endExclusiveIso) upstream.searchParams.set("period2", String(period2));

    const r = await fetch(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
        // Some deployments return 403 without a UA.
        "user-agent": "Mozilla/5.0 (compatible; DAA/0.1; +https://example.invalid)",
      },
      cache: "no-store",
    });

    const text = await r.text();
    if (!r.ok) {
      return json(
        {
          ok: false,
          error: "yfinance upstream error",
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

    const err = payload?.chart?.error;
    if (err) {
      return json(
        {
          ok: false,
          error: "yfinance chart error",
          code: err.code,
          description: err.description,
        },
        { status: 502 },
      );
    }

    const result0 = payload?.chart?.result?.[0];
    const ts: unknown[] = Array.isArray(result0?.timestamp) ? result0.timestamp : [];
    const closes: unknown[] = Array.isArray(result0?.indicators?.quote?.[0]?.close) ? result0.indicators.quote[0].close : [];
    const adjCloses: unknown[] = Array.isArray(result0?.indicators?.adjclose?.[0]?.adjclose) ? result0.indicators.adjclose[0].adjclose : [];

    const rows = ts.map((t, i) => {
      const d = new Date(Number(t) * 1000);
      const iso = Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
      const selectedClose = useAdjustedClose ? (adjCloses[i] ?? closes[i]) : (closes[i] ?? adjCloses[i]);
      return { date: iso, close: selectedClose };
    });

    const normalized = normalizeYfinanceHistoricalQuotes(rows, { start, end });

    return json({
      ok: true,
      source: "yfinance",
      interval: "1d",
      priceMode: useAdjustedClose ? "adjclose" : "close",
      symbol: symbolRaw,
      normalizedSymbol: symbol,
      upstream: upstream.toString(),
      rawCount: rows.length,
      series: normalized.series,
      issues: normalized.issues,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: "yfinance price-series fetch failed", message: msg }, { status: 502 });
  }
}
