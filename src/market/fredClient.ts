/**
 * FRED (Federal Reserve Economic Data) API 客户端
 *
 * 用于获取宏观经济指标：GDP增长率、CPI通胀率、失业率等
 * API 文档: https://fred.stlouisfed.org/docs/api/fred/
 */

import { logSwallowed } from "@/src/daa/utils/logSwallowed";

const FRED_BASE_URL = "https://api.stlouisfed.org/fred";

// 核心序列 ID
export const FRED_SERIES = {
  GDP_GROWTH: "A191RL1Q225SBEA",    // Real GDP Growth Rate (quarterly, % change)
  CPI: "CPIAUCSL",                   // Consumer Price Index (monthly)
  CPI_YOY: "CPALTT01USM657N",       // CPI Year-over-Year % change (monthly)
  UNEMPLOYMENT: "UNRATE",            // Unemployment Rate (monthly)
  FED_FUNDS: "FEDFUNDS",            // Federal Funds Rate (daily)
  PMI_MANUFACTURING: "MANEMP",      // Manufacturing Employment (monthly, proxy for PMI)
} as const;

export type FredSeriesId = (typeof FRED_SERIES)[keyof typeof FRED_SERIES];

export type FredObservation = {
  date: string;       // "2024-01-01"
  value: number | null;
  seriesId: string;
};

export type FredSeriesResult = {
  seriesId: string;
  title: string;
  frequency: string;
  observations: FredObservation[];
  latestValue: number | null;
  latestDate: string | null;
};

export type FredMacroSnapshot = {
  gdpGrowth: number | null;
  cpiYoY: number | null;
  unemployment: number | null;
  fetchedAt: string;
};

/**
 * 从 FRED API 获取单个序列的观测数据
 */
export async function fetchFredSeries(
  apiKey: string,
  seriesId: string,
  opts?: { limit?: number },
): Promise<FredSeriesResult> {
  const limit = opts?.limit ?? 10;
  const url = `${FRED_BASE_URL}/series/observations?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=${limit}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      logSwallowed("fredClient.fetchFredSeries", new Error(`FRED API 返回 ${response.status} for ${seriesId}`));
      return { seriesId, title: "", frequency: "", observations: [], latestValue: null, latestDate: null };
    }

    const payload = (await response.json()) as {
      observations?: Array<{ date?: string; value?: string }>;
    };
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

    return {
      seriesId,
      title: "",
      frequency: "",
      observations,
      latestValue: latestValid?.value ?? null,
      latestDate: latestValid?.date ?? null,
    };
  } catch (err) {
    logSwallowed("fredClient.fetchFredSeries", err);
    return { seriesId, title: "", frequency: "", observations: [], latestValue: null, latestDate: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 批量获取 GDP 增长率、CPI 同比、失业率三个核心宏观指标
 */
export async function fetchFredMacroSnapshot(apiKey: string): Promise<FredMacroSnapshot> {
  const [gdpResult, cpiResult, unempResult] = await Promise.allSettled([
    fetchFredSeries(apiKey, FRED_SERIES.GDP_GROWTH, { limit: 5 }),
    fetchFredSeries(apiKey, FRED_SERIES.CPI_YOY, { limit: 5 }),
    fetchFredSeries(apiKey, FRED_SERIES.UNEMPLOYMENT, { limit: 5 }),
  ]);

  const gdpGrowth = gdpResult.status === "fulfilled" ? gdpResult.value.latestValue : null;
  const cpiYoY = cpiResult.status === "fulfilled" ? cpiResult.value.latestValue : null;
  const unemployment = unempResult.status === "fulfilled" ? unempResult.value.latestValue : null;

  return {
    gdpGrowth,
    cpiYoY,
    unemployment,
    fetchedAt: new Date().toISOString(),
  };
}
