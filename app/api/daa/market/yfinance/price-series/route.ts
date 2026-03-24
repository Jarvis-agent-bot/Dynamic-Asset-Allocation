import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";

import { assertIsoDateString } from "@/src/core/isoDate";
import { addDaysIsoUtc, normalizeYfinanceHistoricalQuotes, normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

function epochSecondsUtcStart(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00.000Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
}

function isValidationMessage(message: string): boolean {
  return /must match YYYY-MM-DD|must be a valid calendar date|must be a non-empty string/i.test(message);
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    try {
      const url = new URL(req.url);
      const symbolRaw = url.searchParams.get("symbol")?.trim();
    if (!symbolRaw) {
      return fail("VALIDATION_FAILED", "missing symbol", { status: 400 });
    }

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
      return fail("VALIDATION_FAILED", "end must be >= start", {
        status: 400,
        details: { start, end },
      });
    }

    const symbol = normalizeYfinanceSymbol(symbolRaw);
    if (!symbol) {
      return fail("VALIDATION_FAILED", "invalid symbol", { status: 400 });
    }

    const period1 = start ? epochSecondsUtcStart(start) : NaN;
    const endExclusiveIso = end ? addDaysIsoUtc(end, 1) : "";
    const period2 = endExclusiveIso ? epochSecondsUtcStart(endExclusiveIso) : NaN;

    const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    upstream.searchParams.set("interval", "1d");
    upstream.searchParams.set("events", "div|split");
    if (start) upstream.searchParams.set("period1", String(period1));
    if (endExclusiveIso) upstream.searchParams.set("period2", String(period2));

    const response = await fetch(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; DAA/0.1; +https://example.invalid)",
      },
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) {
      return fail("INTERNAL_ERROR", "yfinance upstream error", {
        status: 502,
        details: {
          status: response.status,
          body: text.slice(0, 2000),
        },
      });
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch (err) {
  logSwallowed("priceSeriesRoute.parsePayload", err);
      payload = { raw: text };
    }

    const err = payload?.chart?.error;
    if (err) {
      return fail("INTERNAL_ERROR", "yfinance chart error", {
        status: 502,
        details: {
          code: err.code,
          description: err.description,
        },
      });
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

    return ok({
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isValidationMessage(message)) {
        return fail("VALIDATION_FAILED", message, { status: 400 });
      }
      return fail("INTERNAL_ERROR", "yfinance price-series fetch failed", {
        status: 502,
        details: {
          message,
        },
      });
    }
  });
}
