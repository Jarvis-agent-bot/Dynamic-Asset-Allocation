/**
 * FRED (Federal Reserve Economic Data) API 客户端
 *
 * 用于获取宏观经济指标：GDP增长率、CPI通胀率、失业率等
 * API 文档: https://fred.stlouisfed.org/docs/api/fred/
 */

import { appendDaaExternalRequestLog } from "@/src/daa/store/jobStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

const FRED_BASE_URL = "https://api.stlouisfed.org/fred";

// 核心序列 ID
const FRED_SERIES = {
  GDP_GROWTH: "A191RL1Q225SBEA",    // Real GDP Growth Rate (quarterly, % change)
  CPI: "CPIAUCSL",                   // Consumer Price Index (monthly)
  CPI_YOY: "CPALTT01USM657N",       // CPI Year-over-Year % change (monthly)
  PPI: "PPIACO",                     // Producer Price Index: All Commodities (monthly index)
  UNEMPLOYMENT: "UNRATE",            // Unemployment Rate (monthly)
  FED_FUNDS: "FEDFUNDS",             // Effective Federal Funds Rate (monthly)
  FED_BALANCE_SHEET: "WALCL",        // Assets: Total Assets: Total Assets (weekly, millions USD)
  PMI_MANUFACTURING: "MANEMP",      // Manufacturing Employment (monthly, proxy for PMI)
} as const;

type FredObservation = {
  date: string;       // "2024-01-01"
  value: number | null;
  seriesId: string;
};

type FredSeriesResult = {
  seriesId: string;
  title: string;
  frequency: string;
  observations: FredObservation[];
  latestValue: number | null;
  latestDate: string | null;
};

export type FredIndicatorSeriesKey = "ppi_inflation" | "fed_policy_rate" | "fed_balance_sheet";

export type FredIndicatorSeriesPoint = {
  date: string;
  value: number;
};

export type FredMacroSnapshot = {
  gdpGrowth: number | null;
  cpiYoY: number | null;
  ppiYoY: number | null;
  unemployment: number | null;
  policyRate: number | null;
  policyRate3mChange: number | null;
  fedBalanceSheetUsdT: number | null;
  fedBalanceSheet13wChangePct: number | null;
  fetchedAt: string;
};

async function recordFredRequest(input: {
  seriesId: string;
  status: number;
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
}): Promise<void> {
  try {
    await appendDaaExternalRequestLog({
      provider: "fred",
      resource: "fred.series_observations",
      subjectKey: input.seriesId,
      endpointHost: "api.stlouisfed.org",
      httpStatus: input.status,
      errorCode: input.errorCode ?? "",
      errorMessage: input.errorMessage ?? "",
      latencyMs: input.latencyMs,
      retryCount: 0,
      cacheStatus: "cache_bypass",
      caller: "fetchFredSeries",
    });
  } catch (err) {
    logSwallowed("fredClient.recordRequest", err);
  }
}

function validObservationsAsc(result: FredSeriesResult): FredObservation[] {
  return result.observations
    .filter((obs) => obs.value != null && Number.isFinite(obs.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function latestValue(result: FredSeriesResult): number | null {
  return result.latestValue != null && Number.isFinite(result.latestValue) ? result.latestValue : null;
}

function indexYoYPct(result: FredSeriesResult, months = 12): number | null {
  const observations = validObservationsAsc(result);
  if (observations.length <= months) return null;
  const latest = observations[observations.length - 1];
  const previous = observations[observations.length - 1 - months];
  if (!(latest.value != null && latest.value > 0) || !(previous.value != null && previous.value > 0)) return null;
  return ((latest.value - previous.value) / previous.value) * 100;
}

function absoluteChange(result: FredSeriesResult, periods: number): number | null {
  const observations = validObservationsAsc(result);
  if (observations.length <= periods) return null;
  const latest = observations[observations.length - 1];
  const previous = observations[observations.length - 1 - periods];
  if (latest.value == null || previous.value == null) return null;
  return latest.value - previous.value;
}

function percentChange(result: FredSeriesResult, periods: number): number | null {
  const observations = validObservationsAsc(result);
  if (observations.length <= periods) return null;
  const latest = observations[observations.length - 1];
  const previous = observations[observations.length - 1 - periods];
  if (!(latest.value != null && latest.value > 0) || !(previous.value != null && previous.value > 0)) return null;
  return ((latest.value - previous.value) / previous.value) * 100;
}

function usdMillionsToTrillions(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value / 1_000_000;
}

function round(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function filterSeriesByStart(series: FredIndicatorSeriesPoint[], start?: string): FredIndicatorSeriesPoint[] {
  if (!start) return series;
  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs)) return series;
  return series.filter((point) => {
    const pointMs = Date.parse(point.date);
    return Number.isFinite(pointMs) && pointMs >= startMs;
  });
}

function buildIndexYoYSeries(result: FredSeriesResult): FredIndicatorSeriesPoint[] {
  const observations = validObservationsAsc(result);
  const out: FredIndicatorSeriesPoint[] = [];
  for (let i = 12; i < observations.length; i += 1) {
    const current = observations[i];
    const previous = observations[i - 12];
    if (!(current.value != null && current.value > 0) || !(previous.value != null && previous.value > 0)) continue;
    out.push({
      date: current.date,
      value: round(((current.value - previous.value) / previous.value) * 100, 4),
    });
  }
  return out;
}

export async function fetchFredIndicatorSeries(
  apiKey: string,
  key: FredIndicatorSeriesKey,
  opts: { start?: string; limit?: number } = {},
): Promise<FredIndicatorSeriesPoint[]> {
  if (key === "ppi_inflation") {
    const result = await fetchFredSeries(apiKey, FRED_SERIES.PPI, { limit: opts.limit ?? 520 });
    return filterSeriesByStart(buildIndexYoYSeries(result), opts.start);
  }

  if (key === "fed_policy_rate") {
    const result = await fetchFredSeries(apiKey, FRED_SERIES.FED_FUNDS, { limit: opts.limit ?? 520 });
    const series = validObservationsAsc(result).map((item) => ({ date: item.date, value: round(item.value ?? 0, 4) }));
    return filterSeriesByStart(series, opts.start);
  }

  const result = await fetchFredSeries(apiKey, FRED_SERIES.FED_BALANCE_SHEET, { limit: opts.limit ?? 520 });
  const series = validObservationsAsc(result)
    .map((item) => {
      const value = usdMillionsToTrillions(item.value);
      return value == null ? null : { date: item.date, value: round(value, 4) };
    })
    .filter((item): item is FredIndicatorSeriesPoint => Boolean(item));
  return filterSeriesByStart(series, opts.start);
}

/**
 * 从 FRED API 获取单个序列的观测数据
 */
async function fetchFredSeries(
  apiKey: string,
  seriesId: string,
  opts?: { limit?: number },
): Promise<FredSeriesResult> {
  const limit = opts?.limit ?? 10;
  const url = `${FRED_BASE_URL}/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=${limit}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      await recordFredRequest({
        seriesId,
        status: response.status,
        errorCode: `http_${response.status}`,
        errorMessage: "FRED upstream request failed",
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      logSwallowed("fredClient.fetchFredSeries", new Error(`FRED API 返回 ${response.status} for ${seriesId}`));
      return { seriesId, title: "", frequency: "", observations: [], latestValue: null, latestDate: null };
    }

    let payload: { observations?: Array<{ date?: string; value?: string }> };
    try {
      payload = (await response.json()) as {
        observations?: Array<{ date?: string; value?: string }>;
      };
    } catch (err) {
      await recordFredRequest({
        seriesId,
        status: response.status,
        errorCode: "bad_json",
        errorMessage: "FRED returned non-JSON payload",
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      logSwallowed("fredClient.parsePayload", err);
      return { seriesId, title: "", frequency: "", observations: [], latestValue: null, latestDate: null };
    }
    const rawObs = Array.isArray(payload?.observations) ? payload.observations : [];

    const observations: FredObservation[] = rawObs
      .map((obs) => {
        const date = String(obs.date || "");
        const rawVal = String(obs.value || "").trim();
        // FRED 用 "." 表示数据不可用
        const value = rawVal === "." || rawVal === "" ? null : Number(rawVal);
        return {
          date,
          value: value != null && Number.isFinite(value) ? value : null,
          seriesId,
        };
      })
      .filter((obs) => obs.date.length > 0);

    // observations 是降序排列，找到最新的有效值
    const latestValid = observations.find((obs) => obs.value != null);

    await recordFredRequest({
      seriesId,
      status: response.status,
      latencyMs: Math.max(0, Date.now() - startedAt),
    });

    return {
      seriesId,
      title: "",
      frequency: "",
      observations,
      latestValue: latestValid?.value ?? null,
      latestDate: latestValid?.date ?? null,
    };
  } catch (err) {
    await recordFredRequest({
      seriesId,
      status: 0,
      errorCode: err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error",
      errorMessage: err instanceof Error ? err.message : String(err),
      latencyMs: Math.max(0, Date.now() - startedAt),
    });
    logSwallowed("fredClient.fetchFredSeries", err);
    return { seriesId, title: "", frequency: "", observations: [], latestValue: null, latestDate: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 批量获取增长、通胀、就业、政策利率和流动性相关宏观指标
 */
export async function fetchFredMacroSnapshot(apiKey: string): Promise<FredMacroSnapshot> {
  const [gdpResult, cpiResult, ppiResult, unempResult, fedFundsResult, balanceSheetResult] = await Promise.allSettled([
    fetchFredSeries(apiKey, FRED_SERIES.GDP_GROWTH, { limit: 5 }),
    fetchFredSeries(apiKey, FRED_SERIES.CPI_YOY, { limit: 5 }),
    fetchFredSeries(apiKey, FRED_SERIES.PPI, { limit: 24 }),
    fetchFredSeries(apiKey, FRED_SERIES.UNEMPLOYMENT, { limit: 5 }),
    fetchFredSeries(apiKey, FRED_SERIES.FED_FUNDS, { limit: 8 }),
    fetchFredSeries(apiKey, FRED_SERIES.FED_BALANCE_SHEET, { limit: 20 }),
  ]);

  const gdpGrowth = gdpResult.status === "fulfilled" ? latestValue(gdpResult.value) : null;
  const cpiYoY = cpiResult.status === "fulfilled" ? latestValue(cpiResult.value) : null;
  const ppiYoY = ppiResult.status === "fulfilled" ? indexYoYPct(ppiResult.value) : null;
  const unemployment = unempResult.status === "fulfilled" ? latestValue(unempResult.value) : null;
  const policyRate = fedFundsResult.status === "fulfilled" ? latestValue(fedFundsResult.value) : null;
  const policyRate3mChange = fedFundsResult.status === "fulfilled" ? absoluteChange(fedFundsResult.value, 3) : null;
  const fedBalanceSheetUsdT = balanceSheetResult.status === "fulfilled"
    ? usdMillionsToTrillions(latestValue(balanceSheetResult.value))
    : null;
  const fedBalanceSheet13wChangePct = balanceSheetResult.status === "fulfilled"
    ? percentChange(balanceSheetResult.value, 13)
    : null;

  return {
    gdpGrowth,
    cpiYoY,
    ppiYoY,
    unemployment,
    policyRate,
    policyRate3mChange,
    fedBalanceSheetUsdT,
    fedBalanceSheet13wChangePct,
    fetchedAt: new Date().toISOString(),
  };
}
