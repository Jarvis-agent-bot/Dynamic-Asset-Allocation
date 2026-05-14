import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";

import { assertIsoDateString } from "@/src/core/isoDate";
import { addDaysIsoUtc, normalizeYfinanceHistoricalQuotes, normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import { getYahooProvider } from "@/src/market/yahooProvider";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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

      const marketRaw = url.searchParams.get("market")?.trim();
      const symbol = marketRaw
        ? toYfinanceSymbolByMarket(symbolRaw, marketRaw)
        : normalizeYfinanceSymbol(symbolRaw);
      if (!symbol) {
        return fail("VALIDATION_FAILED", "invalid symbol", { status: 400 });
      }

      if (useAdjustedClose) {
        const today = new Date().toISOString().slice(0, 10);
        const effectiveStart = start ?? addDaysIsoUtc(today, -365 * 5);
        const cacheResult = await fetchPriceSeriesWithCache(symbol, effectiveStart, {
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
          interval: "1d",
          priceMode: "adjclose",
          symbol: symbolRaw,
          normalizedSymbol: symbol,
          upstream: cacheResult.source === "db" ? "daa_market_price_history_v1" : "yahoo_provider",
          rawCount: cacheResult.data.length,
          series: normalized.series,
          issues: normalized.issues,
        });
      }

      const period1 = start ? epochSecondsUtcStart(start) : NaN;
      // 当有 start 但没 end 时，默认用明天作为 end（避免 Yahoo Finance 400 错误）
      const effectiveEnd = end
        ? addDaysIsoUtc(end, 1)
        : start
          ? addDaysIsoUtc(new Date().toISOString().slice(0, 10), 1)
          : "";
      const period2 = effectiveEnd ? epochSecondsUtcStart(effectiveEnd) : NaN;

      const yahooResult = await getYahooProvider().fetchChart({
        symbol,
        interval: "1d",
        events: "div|split",
        ...(start ? { period1 } : {}),
        ...(effectiveEnd ? { period2 } : {}),
        timeoutMs: 8_000,
        context: {
          caller: "priceSeriesRoute",
          cacheStatus: "cache_bypass",
        },
      });

      let payload: unknown;
      try {
        payload = yahooResult.payloadJson;
      } catch (err) {
        logSwallowed("priceSeriesRoute.parsePayload", err);
        payload = { raw: yahooResult.payloadText };
      }

      const payloadRoot = isRecord(payload) ? payload : {};
      const chart = isRecord(payloadRoot.chart) ? payloadRoot.chart : {};
      const chartError = isRecord(chart.error) ? chart.error : null;
      if (chartError) {
        return fail("INTERNAL_ERROR", "yfinance chart error", {
          status: 502,
          details: {
            code: chartError.code,
            description: chartError.description,
          },
        });
      }

      const resultRows = Array.isArray(chart.result) ? chart.result : [];
      const result0 = isRecord(resultRows[0]) ? resultRows[0] : {};
      const indicators = isRecord(result0.indicators) ? result0.indicators : {};
      const quoteRows = Array.isArray(indicators.quote) ? indicators.quote : [];
      const quote0 = isRecord(quoteRows[0]) ? quoteRows[0] : {};
      const adjcloseRows = Array.isArray(indicators.adjclose) ? indicators.adjclose : [];
      const adjclose0 = isRecord(adjcloseRows[0]) ? adjcloseRows[0] : {};
      const ts: unknown[] = Array.isArray(result0.timestamp) ? result0.timestamp : [];
      const closes: unknown[] = Array.isArray(quote0.close) ? quote0.close : [];
      const opens: unknown[] = Array.isArray(quote0.open) ? quote0.open : [];
      const highs: unknown[] = Array.isArray(quote0.high) ? quote0.high : [];
      const lows: unknown[] = Array.isArray(quote0.low) ? quote0.low : [];
      const volumes: unknown[] = Array.isArray(quote0.volume) ? quote0.volume : [];
      const adjCloses: unknown[] = Array.isArray(adjclose0.adjclose) ? adjclose0.adjclose : [];

      const rows = ts.map((t, i) => {
        const d = new Date(Number(t) * 1000);
        const iso = Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
        const selectedClose = useAdjustedClose ? (adjCloses[i] ?? closes[i]) : (closes[i] ?? adjCloses[i]);
        const open = Number(opens[i]);
        const high = Number(highs[i]);
        const low = Number(lows[i]);
        const vol = Number(volumes[i]);
        return {
          date: iso,
          close: selectedClose,
          open: Number.isFinite(open) && open > 0 ? open : undefined,
          high: Number.isFinite(high) && high > 0 ? high : undefined,
          low: Number.isFinite(low) && low > 0 ? low : undefined,
          volume: Number.isFinite(vol) && vol >= 0 ? vol : undefined,
        };
      });

      const normalized = normalizeYfinanceHistoricalQuotes(rows, { start, end });

      return ok({
        source: "yfinance",
        interval: "1d",
        priceMode: useAdjustedClose ? "adjclose" : "close",
        symbol: symbolRaw,
        normalizedSymbol: symbol,
        upstream: yahooResult.url,
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
