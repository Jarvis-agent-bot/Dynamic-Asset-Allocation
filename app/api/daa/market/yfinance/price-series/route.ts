import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";

import { assertIsoDateString } from "@/src/core/isoDate";
import { addDaysIsoUtc, normalizeYfinanceHistoricalQuotes, normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { fetchPriceSeriesWithCache, type PriceSeriesInterval } from "@/src/daa/modules/marketCache/priceSeriesCache";

export const runtime = "nodejs";

function isValidationMessage(message: string): boolean {
  return /must match YYYY-MM-DD|must be a valid calendar date|must be a non-empty string/i.test(message);
}

function parseBooleanFlag(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  const text = value.trim().toLowerCase();
  if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
  if (text === "0" || text === "false" || text === "no" || text === "off") return false;
  return fallback;
}

function parseInterval(value: string | null): PriceSeriesInterval | null {
  const text = String(value || "1d").trim();
  if (text === "1d") return "1d";
  return null;
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
      const requireOhlcv = parseBooleanFlag(url.searchParams.get("requireOhlcv"), false);
      const effectiveAdjusted = requireOhlcv ? false : useAdjustedClose;
      const interval = parseInterval(url.searchParams.get("interval"));
      if (!interval) {
        return fail("VALIDATION_FAILED", "interval 当前仅支持 1d", { status: 400 });
      }

      if (start !== undefined) assertIsoDateString(start, "start");
      if (end !== undefined) assertIsoDateString(end, "end");
      if (start && end && end < start) {
        return fail("VALIDATION_FAILED", "end must be >= start", {
          status: 400,
          details: { start, end },
        });
      }

      const marketRaw = url.searchParams.get("market")?.trim();
      const symbol = marketRaw
        ? toYfinanceSymbolByMarket(symbolRaw, marketRaw)
        : normalizeYfinanceSymbol(symbolRaw);
      if (!symbol) {
        return fail("VALIDATION_FAILED", "invalid symbol", { status: 400 });
      }

      const today = new Date().toISOString().slice(0, 10);
      const effectiveStart = start ?? addDaysIsoUtc(today, -365 * 5);
      const cacheResult = await fetchPriceSeriesWithCache(symbol, effectiveStart, {
        market: marketRaw,
        interval,
        adjusted: effectiveAdjusted,
        requireOhlcv,
        minDbDays: start ? 15 : 100,
        maxStaleDays: 2,
        timeoutMs: 8_000,
      });

      if (cacheResult.error && cacheResult.data.length <= 0) {
        return fail("INTERNAL_ERROR", "yfinance price-series fetch failed", {
          status: 502,
          details: { message: cacheResult.error },
        });
      }

      const normalized = normalizeYfinanceHistoricalQuotes(cacheResult.data, { start, end });
      return ok({
        source: cacheResult.source,
        interval: cacheResult.interval,
        priceMode: cacheResult.priceMode,
        symbol: symbolRaw,
        normalizedSymbol: symbol,
        upstream: cacheResult.upstream,
        rawCount: cacheResult.data.length,
        rowsWritten: cacheResult.rowsWritten ?? 0,
        requiresOhlcv: requireOhlcv,
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
