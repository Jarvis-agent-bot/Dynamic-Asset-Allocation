import { clamp } from "@/src/core/math";
import type { DaaMarketIndicatorsConfig } from "@/src/daa/config/systemConfig";
import { resolveSecret } from "@/src/daa/config/secretsManager";
import { fetchFredMacroSnapshot, type FredMacroSnapshot } from "@/src/market/fredClient";
import type { FredMacroInput } from "@/src/daa/modules/marketContext/macroCycleClassifier";
import {
  MARKET_INDICATOR_KEY_BY_CONFIG_KEY,
  MARKET_INDICATOR_KEYS,
  MARKET_INDICATOR_META_CATALOG,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import { buildMarketContextFromIndicators } from "@/src/daa/modules/marketContext/marketContextOverlay";
import { marketRegimeActionLabelZh } from "@/src/daa/modules/marketContext/marketContextLabels";
import type {
  DaaMarketContext,
  DaaMarketIndicatorKey,
  DaaMarketIndicatorScope,
  DaaMarketIndicatorSnapshot,
  DaaMarketRegime,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import {
  getDaaSystemConfig,
  listDaaMarketIndicatorHistory,
  listLatestDaaMarketIndicatorSnapshots,
  upsertDaaMarketIndicatorSnapshots,
  type DaaStoreMarketIndicatorSnapshot,
} from "@/src/daa/store/daaStorePg";
import { upsertMacroCycleSnapshot } from "@/src/daa/store/marketCacheStore";
import { addDaysIsoUtc, normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

type RefreshMarketIndicatorsResult = {
  marketContext: DaaMarketContext | null;
  indicators: DaaMarketIndicatorSnapshot[];
  refreshedCount: number;
};

type DailyCloseBar = {
  date: string;
  close: number;
};

type ComputedIndicatorRow = {
  snapshot: DaaMarketIndicatorSnapshot;
  reasonsJson: string[];
  componentsJson: Record<string, unknown>;
  expireAt: string | null;
  scope: string;
  subjectKey: string;
};

type FredPolicyIndicatorKey = "ppi_inflation" | "fed_policy_rate" | "fed_balance_sheet";

const FRED_POLICY_INDICATOR_KEYS: FredPolicyIndicatorKey[] = [
  "ppi_inflation",
  "fed_policy_rate",
  "fed_balance_sheet",
];

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function percentileOfLatest(values: number[]): number | null {
  const series = values.filter(Number.isFinite);
  if (!series.length) return null;
  const latest = series[series.length - 1];
  const sorted = [...series].sort((a, b) => a - b);
  const idx = sorted.findIndex((item) => item >= latest);
  const resolved = idx >= 0 ? idx : sorted.length - 1;
  return (resolved / Math.max(1, sorted.length - 1)) * 100;
}

function zscoreOfLatest(values: number[]): number | null {
  const series = values.filter(Number.isFinite);
  if (series.length < 3) return null;
  const latest = series[series.length - 1];
  const mean = series.reduce((sum, item) => sum + item, 0) / series.length;
  const variance = series.reduce((sum, item) => sum + ((item - mean) ** 2), 0) / Math.max(1, series.length - 1);
  const stdev = Math.sqrt(Math.max(variance, 0));
  if (!(stdev > 0)) return 0;
  return (latest - mean) / stdev;
}

function trendPct(values: number[], lookbackDays: number): number | null {
  if (values.length < lookbackDays + 1) return null;
  const latest = values[values.length - 1];
  const previous = values[values.length - 1 - lookbackDays];
  if (!(latest > 0) || !(previous > 0)) return null;
  return ((latest - previous) / previous) * 100;
}

function annualizedVolPctFromCloses(values: number[]): number | null {
  if (values.length < 2) return null;
  const returns: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    const curr = values[i];
    if (!(prev > 0) || !(curr > 0)) continue;
    returns.push((curr - prev) / prev);
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, item) => sum + item, 0) / returns.length;
  const variance = returns.reduce((sum, item) => sum + ((item - mean) ** 2), 0) / Math.max(1, returns.length - 1);
  return Math.sqrt(Math.max(variance, 0)) * Math.sqrt(365) * 100;
}

function buildRollingVolPct(closes: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = window; i < closes.length; i += 1) {
    const sample = closes.slice(i - window, i + 1);
    const vol = annualizedVolPctFromCloses(sample);
    if (vol != null) out.push(vol);
  }
  return out;
}

function stanceFromScore(scorePct: number): DaaMarketRegime | "neutral" {
  if (scorePct >= 65) return "risk_off";
  if (scorePct <= 35) return "risk_on";
  return "neutral";
}

/**
 * 使用通用缓存层获取每日收盘价（DB 优先 + 按需补增量）。
 *
 * 关键：maxStaleDays=0 确保每次都尝试补最新数据（指标需要盘中价格）。
 * 但 DB 有历史数据时只拉增量（最近几天），不再全量拉 270 天。
 */
async function fetchDailyCloseBars(symbolRaw: string, days: number): Promise<DailyCloseBar[]> {
  const { fetchPriceSeriesWithCache } = await import("@/src/daa/modules/marketCache/priceSeriesCache");
  const symbol = normalizeYfinanceSymbol(symbolRaw);
  if (!symbol) return [];
  const safeDays = Math.max(40, Math.trunc(days));
  const start = addDaysIsoUtc(new Date().toISOString().slice(0, 10), -safeDays - 14);

  try {
    const result = await fetchPriceSeriesWithCache(symbol, start, {
      minDbDays: Math.floor(safeDays * 0.8), // 需要 80% 天数才走增量，否则全量拉
      maxStaleDays: 1, // 允许 1 天 stale（避免频繁拉 Yahoo 触发 429）
      timeoutMs: 10000,
    });
    return result.data.slice(-safeDays).map((p) => ({ date: p.date, close: p.close }));
  } catch (err) {
    logSwallowed("marketIndicatorService.fetchDailyCloses", err);
    return [];
  }
}

function buildExpireAt(refreshIntervalMinutes: number, generatedAt: string): string {
  const baseMs = Date.parse(generatedAt);
  return new Date((Number.isFinite(baseMs) ? baseMs : Date.now()) + refreshIntervalMinutes * 60 * 1000).toISOString();
}

function mapStoredIndicatorSnapshotToView(row: DaaStoreMarketIndicatorSnapshot): DaaMarketIndicatorSnapshot {
  const meta = MARKET_INDICATOR_META_CATALOG[row.key];
  return {
    key: row.key,
    label: meta.label,
    category: meta.category,
    scope: row.scope as DaaMarketIndicatorScope,
    stance: row.stance,
    riskOffScorePct: row.riskOffScorePct,
    confidencePct: row.confidencePct,
    rawValue: row.rawValue,
    unit: row.unit || meta.unit,
    percentile252: row.percentile252,
    zscore60: row.zscore60,
    trend1dPct: row.trend1dPct,
    trend7dPct: row.trend7dPct,
    trend30dPct: row.trend30dPct,
    reason: row.reasonsJson[0] || "市场状态中性",
    source: row.source || meta.source,
    generatedAt: row.generatedAt,
  };
}

function buildStoredRowPayload(input: ComputedIndicatorRow): Partial<DaaStoreMarketIndicatorSnapshot> {
  return {
    key: input.snapshot.key,
    scope: input.scope,
    subjectKey: input.subjectKey,
    stance: input.snapshot.stance,
    riskOffScorePct: input.snapshot.riskOffScorePct,
    confidencePct: input.snapshot.confidencePct,
    rawValue: input.snapshot.rawValue,
    unit: input.snapshot.unit,
    percentile252: input.snapshot.percentile252,
    zscore60: input.snapshot.zscore60,
    trend1dPct: input.snapshot.trend1dPct,
    trend7dPct: input.snapshot.trend7dPct,
    trend30dPct: input.snapshot.trend30dPct,
    source: input.snapshot.source,
    reasonsJson: input.reasonsJson,
    componentsJson: input.componentsJson,
    generatedAt: input.snapshot.generatedAt,
    expireAt: input.expireAt,
  };
}

function finalizeIndicatorRow(input: {
  key: DaaMarketIndicatorKey;
  scorePct: number;
  confidencePct: number;
  rawValue: number | null;
  percentile252: number | null;
  zscore60: number | null;
  trend1dPct: number | null;
  trend7dPct: number | null;
  trend30dPct: number | null;
  reason: string;
  componentsJson?: Record<string, unknown>;
}): ComputedIndicatorRow {
  const meta = MARKET_INDICATOR_META_CATALOG[input.key];
  const generatedAt = new Date().toISOString();
  return {
    snapshot: {
      key: input.key,
      label: meta.label,
      category: meta.category,
      scope: meta.scope,
      stance: stanceFromScore(input.scorePct),
      riskOffScorePct: round(input.scorePct),
      confidencePct: round(input.confidencePct),
      rawValue: input.rawValue == null ? null : round(input.rawValue, meta.unit === "x" ? 4 : 2),
      unit: meta.unit,
      percentile252: input.percentile252 == null ? null : round(input.percentile252),
      zscore60: input.zscore60 == null ? null : round(input.zscore60, 3),
      trend1dPct: input.trend1dPct == null ? null : round(input.trend1dPct),
      trend7dPct: input.trend7dPct == null ? null : round(input.trend7dPct),
      trend30dPct: input.trend30dPct == null ? null : round(input.trend30dPct),
      reason: input.reason,
      source: meta.source,
      generatedAt,
    },
    reasonsJson: [input.reason],
    componentsJson: input.componentsJson || {},
    expireAt: null,
    scope: meta.scope,
    subjectKey: "GLOBAL",
  };
}

function isFredPolicyIndicatorEnabled(config: DaaMarketIndicatorsConfig, key: FredPolicyIndicatorKey): boolean {
  if (key === "ppi_inflation") return config.indicators.ppiInflation?.enabled === true;
  if (key === "fed_policy_rate") return config.indicators.fedPolicyRate?.enabled === true;
  return config.indicators.fedBalanceSheet?.enabled === true;
}

function buildUnavailableFredIndicatorRow(key: FredPolicyIndicatorKey, reason: string): ComputedIndicatorRow {
  return finalizeIndicatorRow({
    key,
    scorePct: 50,
    confidencePct: 0,
    rawValue: null,
    percentile252: null,
    zscore60: null,
    trend1dPct: null,
    trend7dPct: null,
    trend30dPct: null,
    reason: `${MARKET_INDICATOR_META_CATALOG[key].label} 暂不可用：${reason}`,
    componentsJson: {
      unavailable: true,
      reason,
    },
  });
}

function scorePpiInflation(ppiYoY: number): number {
  return clamp(10 + ppiYoY * 13.5, 0, 100);
}

function scorePolicyRate(policyRate: number, rate3mChange: number | null): number {
  const levelScore = clamp(20 + (policyRate - 1) * 18, 10, 90);
  const trendAdjustment = rate3mChange == null
    ? 0
    : rate3mChange < -0.05
      ? -Math.min(20, Math.abs(rate3mChange) * 20)
      : rate3mChange > 0.05
        ? Math.min(20, rate3mChange * 20)
        : 0;
  return clamp(levelScore + trendAdjustment, 0, 100);
}

function scoreFedBalanceSheet(change13wPct: number): number {
  return clamp(50 - change13wPct * 8, 15, 90);
}

function buildFredPolicyIndicatorRows(input: {
  config: DaaMarketIndicatorsConfig;
  fredMacro: FredMacroSnapshot | null;
  fredConfigured: boolean;
}): ComputedIndicatorRow[] {
  const rows: ComputedIndicatorRow[] = [];
  for (const key of FRED_POLICY_INDICATOR_KEYS) {
    if (!isFredPolicyIndicatorEnabled(input.config, key)) continue;

    if (!input.fredConfigured) {
      rows.push(buildUnavailableFredIndicatorRow(key, "未配置 FRED API Key，系统只能使用市场代理指标"));
      continue;
    }

    if (key === "ppi_inflation") {
      const ppiYoY = input.fredMacro?.ppiYoY;
      if (ppiYoY == null || !Number.isFinite(ppiYoY)) {
        rows.push(buildUnavailableFredIndicatorRow(key, "FRED 未返回有效 PPI 序列"));
        continue;
      }
      const score = scorePpiInflation(ppiYoY);
      const reason = score >= 65
        ? `PPI 同比 ${ppiYoY.toFixed(1)}%，生产端通胀压力偏高，降息空间受约束`
        : score <= 40
          ? `PPI 同比 ${ppiYoY.toFixed(1)}%，生产端通胀压力缓和`
          : `PPI 同比 ${ppiYoY.toFixed(1)}%，生产端通胀处于中性区间`;
      rows.push(finalizeIndicatorRow({
        key,
        scorePct: score,
        confidencePct: 82,
        rawValue: ppiYoY,
        percentile252: null,
        zscore60: null,
        trend1dPct: null,
        trend7dPct: null,
        trend30dPct: null,
        reason,
        componentsJson: { ppiYoYPct: ppiYoY },
      }));
      continue;
    }

    if (key === "fed_policy_rate") {
      const policyRate = input.fredMacro?.policyRate;
      if (policyRate == null || !Number.isFinite(policyRate)) {
        rows.push(buildUnavailableFredIndicatorRow(key, "FRED 未返回有效联邦基金利率"));
        continue;
      }
      const change3m = input.fredMacro?.policyRate3mChange ?? null;
      const score = scorePolicyRate(policyRate, change3m);
      const changeText = change3m == null
        ? "近期变化未知"
        : change3m < -0.05
          ? `近 3 个月下降 ${Math.abs(change3m).toFixed(2)} 个百分点`
          : change3m > 0.05
            ? `近 3 个月上升 ${change3m.toFixed(2)} 个百分点`
            : "近 3 个月基本持平";
      const reason = score >= 65
        ? `联邦基金利率 ${policyRate.toFixed(2)}%，${changeText}，高利率仍压制风险资产估值`
        : score <= 40
          ? `联邦基金利率 ${policyRate.toFixed(2)}%，${changeText}，政策利率压力缓和`
          : `联邦基金利率 ${policyRate.toFixed(2)}%，${changeText}，政策利率处于观察区间`;
      rows.push(finalizeIndicatorRow({
        key,
        scorePct: score,
        confidencePct: 88,
        rawValue: policyRate,
        percentile252: null,
        zscore60: null,
        trend1dPct: null,
        trend7dPct: null,
        trend30dPct: null,
        reason,
        componentsJson: {
          policyRatePct: policyRate,
          policyRate3mChangePct: change3m,
        },
      }));
      continue;
    }

    const balanceSheetUsdT = input.fredMacro?.fedBalanceSheetUsdT;
    const change13w = input.fredMacro?.fedBalanceSheet13wChangePct;
    if (
      balanceSheetUsdT == null
      || !Number.isFinite(balanceSheetUsdT)
      || change13w == null
      || !Number.isFinite(change13w)
    ) {
      rows.push(buildUnavailableFredIndicatorRow(key, "FRED 未返回有效资产负债表或 13 周变化"));
      continue;
    }
    const score = scoreFedBalanceSheet(change13w);
    const reason = score >= 65
      ? `美联储资产负债表约 ${balanceSheetUsdT.toFixed(2)} 万亿美元，近 13 周收缩 ${Math.abs(change13w).toFixed(1)}%，缩表压力偏高`
      : score <= 40
        ? `美联储资产负债表约 ${balanceSheetUsdT.toFixed(2)} 万亿美元，近 13 周变化 ${change13w.toFixed(1)}%，流动性约束缓和`
        : `美联储资产负债表约 ${balanceSheetUsdT.toFixed(2)} 万亿美元，近 13 周变化 ${change13w.toFixed(1)}%，缩表压力中性`;
    rows.push(finalizeIndicatorRow({
      key,
      scorePct: score,
      confidencePct: 82,
      rawValue: balanceSheetUsdT,
      percentile252: null,
      zscore60: null,
      trend1dPct: null,
      trend7dPct: null,
      trend30dPct: null,
      reason,
      componentsJson: {
        fedBalanceSheetUsdT: balanceSheetUsdT,
        fedBalanceSheet13wChangePct: change13w,
      },
    }));
  }
  return rows;
}

async function computeVixIndicator(getBars: (symbol: string, days: number) => Promise<DailyCloseBar[]>): Promise<ComputedIndicatorRow | null> {
  const bars = await getBars("^VIX", 270);
  const closes = bars.map((item) => item.close).filter((item) => item > 0);
  if (closes.length < 15) return null; // 降低门槛：15 天即可计算（数据少时百分位精度下降但有输出）
  const sample = closes.slice(-252);
  const latest = sample[sample.length - 1];
  const percentile252 = percentileOfLatest(sample);
  const zscore60 = zscoreOfLatest(sample.slice(-60));
  const score = clamp(percentile252 ?? 50, 0, 100);
  const reason = score >= 75
    ? "VIX 处于高位，美股风险偏好明显降温"
    : score <= 25
      ? "VIX 处于低位，美股波动压力较低"
      : "VIX 位于中性区间，美股波动尚未形成极端压力";
  return finalizeIndicatorRow({
    key: "vix",
    scorePct: score,
    confidencePct: closes.length >= 180 ? 90 : 70,
    rawValue: latest,
    percentile252,
    zscore60,
    trend1dPct: trendPct(closes, 1),
    trend7dPct: trendPct(closes, 7),
    trend30dPct: trendPct(closes, 30),
    reason,
  });
}

async function computeRatioIndicator(input: {
  key: DaaMarketIndicatorKey;
  leftSymbol: string;
  rightSymbol: string;
  riskDirection: "high_is_risk_off" | "low_is_risk_off";
  highReason: string;
  lowReason: string;
  getBars: (symbol: string, days: number) => Promise<DailyCloseBar[]>;
}): Promise<ComputedIndicatorRow | null> {
  const [leftBars, rightBars] = await Promise.all([
    input.getBars(input.leftSymbol, 270),
    input.getBars(input.rightSymbol, 270),
  ]);
  const len = Math.min(leftBars.length, rightBars.length);
  if (len < 40) return null;
  const ratios: number[] = [];
  for (let i = 0; i < len; i += 1) {
    const left = leftBars[leftBars.length - len + i]?.close;
    const right = rightBars[rightBars.length - len + i]?.close;
    if (!(left > 0) || !(right > 0)) continue;
    ratios.push(left / right);
  }
  if (ratios.length < 40) return null;
  const sample = ratios.slice(-252);
  const latest = sample[sample.length - 1];
  const percentile252 = percentileOfLatest(sample);
  const zscore60 = zscoreOfLatest(sample.slice(-60));
  const percentileScore = clamp(percentile252 ?? 50, 0, 100);
  const score = input.riskDirection === "high_is_risk_off" ? percentileScore : 100 - percentileScore;
  const reason = percentileScore >= 75
    ? input.highReason
    : percentileScore <= 25
      ? input.lowReason
      : `${MARKET_INDICATOR_META_CATALOG[input.key].label} 位于中性区间，风格切换不明显`;
  return finalizeIndicatorRow({
    key: input.key,
    scorePct: score,
    confidencePct: 85,
    rawValue: latest,
    percentile252,
    zscore60,
    trend1dPct: trendPct(ratios, 1),
    trend7dPct: trendPct(ratios, 7),
    trend30dPct: trendPct(ratios, 30),
    reason,
  });
}

async function computeRealizedVolIndicator(input: {
  key: DaaMarketIndicatorKey;
  symbol: string;
  highReason: string;
  lowReason: string;
  getBars: (symbol: string, days: number) => Promise<DailyCloseBar[]>;
}): Promise<ComputedIndicatorRow | null> {
  const bars = await input.getBars(input.symbol, 320);
  const closes = bars.map((item) => item.close).filter((item) => item > 0);
  if (closes.length < 15) return null; // 降低门槛：15 天即可计算波动率
  const rollingVols = buildRollingVolPct(closes, 20);
  if (rollingVols.length < 40) return null;
  const sample = rollingVols.slice(-252);
  const latest = sample[sample.length - 1];
  const percentile252 = percentileOfLatest(sample);
  const zscore60 = zscoreOfLatest(sample.slice(-60));
  const score = clamp(percentile252 ?? 50, 0, 100);
  const reason = score >= 75
    ? input.highReason
    : score <= 25
      ? input.lowReason
      : `${MARKET_INDICATOR_META_CATALOG[input.key].label} 位于中性区间，波动环境未见极端`;
  return finalizeIndicatorRow({
    key: input.key,
    scorePct: score,
    confidencePct: closes.length >= 240 ? 88 : 72,
    rawValue: latest,
    percentile252,
    zscore60,
    trend1dPct: trendPct(sample, 1),
    trend7dPct: trendPct(sample, 7),
    trend30dPct: trendPct(sample, 30),
    reason,
  });
}

async function computeEnabledIndicators(input: {
  config: DaaMarketIndicatorsConfig;
  fredMacro: FredMacroSnapshot | null;
  fredConfigured: boolean;
}): Promise<ComputedIndicatorRow[]> {
  const { config } = input;
  const barCache = new Map<string, Promise<DailyCloseBar[]>>();
  const getBars = (symbol: string, days: number) => {
    const key = `${normalizeYfinanceSymbol(symbol)}::${days}`;
    if (!barCache.has(key)) {
      barCache.set(key, fetchDailyCloseBars(symbol, days));
    }
    return barCache.get(key)!;
  };

  const rows: Array<Promise<ComputedIndicatorRow | null>> = [];
  if (config.indicators.vix?.enabled) {
    rows.push(computeVixIndicator(getBars));
  }
  if (config.indicators.qqqSpyRatio?.enabled) {
    rows.push(computeRatioIndicator({
      key: "qqq_spy_ratio",
      leftSymbol: "QQQ",
      rightSymbol: "SPY",
      riskDirection: "low_is_risk_off",
      highReason: "QQQ 相对 SPY 偏强，美股成长风格占优，可提高美股买入预算",
      lowReason: "QQQ 相对 SPY 走弱，美股风格转向防守",
      getBars,
    }));
  }
  if (config.indicators.fxiVolatility?.enabled) {
    rows.push(computeRealizedVolIndicator({
      key: "fxi_volatility",
      symbol: "FXI",
      highReason: "FXI 波动率处于高位，港股 / 中概风险偏好承压",
      lowReason: "FXI 波动率回落，港股 / 中概波动环境改善",
      getBars,
    }));
  }
  if (config.indicators.kwebFxiRatio?.enabled) {
    rows.push(computeRatioIndicator({
      key: "kweb_fxi_ratio",
      leftSymbol: "KWEB",
      rightSymbol: "FXI",
      riskDirection: "low_is_risk_off",
      highReason: "KWEB 相对 FXI 偏强，港股 / 中概成长风格回暖",
      lowReason: "KWEB 相对 FXI 偏弱，港股 / 中概成长风格转冷",
      getBars,
    }));
  }
  if (config.indicators.btcEthRatio?.enabled) {
    rows.push(computeRatioIndicator({
      key: "btc_eth_ratio",
      leftSymbol: "BTC-USD",
      rightSymbol: "ETH-USD",
      riskDirection: "high_is_risk_off",
      highReason: "BTC 相对 ETH 偏强，加密市场风险偏好收缩，应降低高 beta 加密配置",
      lowReason: "ETH 相对 BTC 偏强，加密市场风险偏好回升",
      getBars,
    }));
  }
  if (config.indicators.btcVolatility?.enabled) {
    rows.push(computeRealizedVolIndicator({
      key: "btc_volatility",
      symbol: "BTC-USD",
      highReason: "BTC 波动率处于高位，加密市场情绪偏脆弱",
      lowReason: "BTC 波动率回落，加密市场波动压力缓和",
      getBars,
    }));
  }
  if (config.indicators.goldSilverRatio?.enabled) {
    rows.push(computeRatioIndicator({
      key: "gold_silver_ratio",
      leftSymbol: "GC=F",
      rightSymbol: "SI=F",
      riskDirection: "high_is_risk_off",
      highReason: "金银比高位，宏观资金偏向防御资产",
      lowReason: "金银比低位，宏观防御需求有所缓和",
      getBars,
    }));
  }

  // 收益率曲线斜率 (IEF/SHY)
  if (config.indicators.yieldCurveSpread?.enabled) {
    rows.push(computeRatioIndicator({
      key: "yield_curve_spread",
      leftSymbol: "IEF",
      rightSymbol: "SHY",
      riskDirection: "low_is_risk_off",
      highReason: "收益率曲线陡峭，经济扩张信号",
      lowReason: "收益率曲线平坦/倒挂，衰退风险上升",
      getBars,
    }));
  }

  // 美元强弱 (UUP)
  if (config.indicators.usdStrength?.enabled) {
    rows.push(computeRealizedVolIndicator({
      key: "usd_strength",
      symbol: "UUP",
      highReason: "美元走强波动加剧，新兴市场承压",
      lowReason: "美元走弱波动平稳，全球风险偏好回暖",
      getBars,
    }));
  }

  // 信用利差 (HYG/LQD)
  if (config.indicators.creditSpread?.enabled) {
    rows.push(computeRatioIndicator({
      key: "credit_spread",
      leftSymbol: "HYG",
      rightSymbol: "LQD",
      riskDirection: "low_is_risk_off",
      highReason: "高收益债表现强势，信用环境宽松",
      lowReason: "信用利差扩大，信用风险上升",
      getBars,
    }));
  }

  // 通胀预期 (TIP/IEF)
  if (config.indicators.inflationExpectation?.enabled) {
    rows.push(computeRatioIndicator({
      key: "inflation_expectation",
      leftSymbol: "TIP",
      rightSymbol: "IEF",
      riskDirection: "high_is_risk_off",
      highReason: "通胀预期升温，名义债承压，组合应提高通胀对冲和现金缓冲权重",
      lowReason: "通胀预期回落，名义债券相对占优",
      getBars,
    }));
  }

  // 市场广度 (RSP/SPY)
  if (config.indicators.marketBreadth?.enabled) {
    rows.push(computeRatioIndicator({
      key: "market_breadth",
      leftSymbol: "RSP",
      rightSymbol: "SPY",
      riskDirection: "low_is_risk_off",
      highReason: "市场广度良好，涨幅分散健康",
      lowReason: "市场窄幅上涨，风险集中于头部",
      getBars,
    }));
  }

  const resolved = await Promise.all(rows);
  const expireAt = buildExpireAt(config.refreshIntervalMinutes, new Date().toISOString());
  const marketRows = resolved
    .filter((item): item is ComputedIndicatorRow => Boolean(item))
    .map((item) => ({ ...item, expireAt }));
  const fredRows = buildFredPolicyIndicatorRows(input).map((item) => ({ ...item, expireAt }));
  return [...marketRows, ...fredRows];
}

function hasFreshCoverage(input: {
  snapshots: DaaStoreMarketIndicatorSnapshot[];
  config: DaaMarketIndicatorsConfig;
  allowStale: boolean;
}): boolean {
  const nowMs = Date.now();
  return Object.entries(input.config.indicators).every(([configKey, row]) => {
    if (!row?.enabled) return true;
    const key = MARKET_INDICATOR_KEY_BY_CONFIG_KEY[configKey as keyof DaaMarketIndicatorsConfig["indicators"]];
    const snapshot = input.snapshots.find((item) => item.key === key);
    if (!snapshot) return false;
    if (input.allowStale) return true;
    if (!snapshot.expireAt) return true;
    const expireMs = Date.parse(snapshot.expireAt);
    return Number.isFinite(expireMs) && expireMs > nowMs;
  });
}

function buildContextFromStoredSnapshots(input: {
  snapshots: DaaStoreMarketIndicatorSnapshot[];
  config: DaaMarketIndicatorsConfig;
}): DaaMarketContext | null {
  const views = input.snapshots.map((item) => mapStoredIndicatorSnapshotToView(item));
  return buildMarketContextFromIndicators({ indicators: views, config: input.config });
}

export function marketRegimeLabelZh(regime: DaaMarketRegime | null | undefined): string {
  return marketRegimeActionLabelZh(regime);
}

export async function refreshMarketIndicators(): Promise<RefreshMarketIndicatorsResult> {
  const system = await getDaaSystemConfig();
  const config = system.config.dataSources.marketIndicators;
  if (!config.enabled) {
    return { marketContext: null, indicators: [], refreshedCount: 0 };
  }

  // 尝试获取 FRED 宏观数据
  let fredMacro: FredMacroInput | null = null;
  let fredSnapshot: FredMacroSnapshot | null = null;
  const fredApiKey = await resolveSecret("fred_api_key");
  if (fredApiKey) {
    try {
      const snapshot = await fetchFredMacroSnapshot(fredApiKey);
      fredSnapshot = snapshot;
      fredMacro = {
        gdpGrowthPct: snapshot.gdpGrowth,
        cpiYoYPct: snapshot.cpiYoY,
        ppiYoYPct: snapshot.ppiYoY,
        unemploymentPct: snapshot.unemployment,
        policyRatePct: snapshot.policyRate,
        policyRate3mChangePct: snapshot.policyRate3mChange,
        fedBalanceSheetUsdT: snapshot.fedBalanceSheetUsdT,
        fedBalanceSheet13wChangePct: snapshot.fedBalanceSheet13wChangePct,
      };
    } catch (err) {
      logSwallowed("refreshMarketIndicators.fred", err);
    }
  }

  const computed = await computeEnabledIndicators({
    config,
    fredMacro: fredSnapshot,
    fredConfigured: Boolean(fredApiKey),
  });
  if (computed.length <= 0) {
    return { marketContext: null, indicators: [], refreshedCount: 0 };
  }

  const refreshedCount = await upsertDaaMarketIndicatorSnapshots(computed.map((item) => buildStoredRowPayload(item)));
  const indicators = computed.map((item) => item.snapshot);
  const marketContext = buildMarketContextFromIndicators({ indicators, config, fredMacro });

  // 持久化宏观周期快照（fire-and-forget，不阻塞刷新流程）
  const macroCycle = marketContext?.macroCycle;
  if (macroCycle) {
    const hasFredMacroData = Boolean(fredMacro && [
      fredMacro.gdpGrowthPct,
      fredMacro.cpiYoYPct,
      fredMacro.ppiYoYPct,
      fredMacro.unemploymentPct,
    ].some((item) => item != null && Number.isFinite(item)));
    upsertMacroCycleSnapshot({
      phase: macroCycle.phase,
      growthProxy: macroCycle.growthProxy,
      inflationProxy: macroCycle.inflationProxy,
      confidence: macroCycle.confidence,
      label: macroCycle.label,
      favoredAssets: macroCycle.favoredAssets,
      dataSource: hasFredMacroData ? "fred" : "proxy",
      fredGdpPct: fredMacro?.gdpGrowthPct,
      fredCpiPct: fredMacro?.cpiYoYPct,
      fredUnemploymentPct: fredMacro?.unemploymentPct,
    }).catch((err) => logSwallowed("refreshMarketIndicators.persistMacroCycle", err));
  }

  return { marketContext, indicators, refreshedCount };
}

export async function getCurrentMarketContext(input: {
  forceRefresh?: boolean;
  allowStale?: boolean;
} = {}): Promise<DaaMarketContext | null> {
  const system = await getDaaSystemConfig();
  const config = system.config.dataSources.marketIndicators;
  if (!config.enabled) return null;

  if (input.forceRefresh) {
    try {
      return (await refreshMarketIndicators()).marketContext;
    } catch (err) {
      logSwallowed("marketIndicatorService.forceRefresh", err);
    }
  }

  const latestSnapshots = await listLatestDaaMarketIndicatorSnapshots();
  if (latestSnapshots.length > 0 && hasFreshCoverage({ snapshots: latestSnapshots, config, allowStale: input.allowStale === true })) {
    return buildContextFromStoredSnapshots({ snapshots: latestSnapshots, config });
  }

  try {
    return (await refreshMarketIndicators()).marketContext;
  } catch (err) {
    logSwallowed("marketIndicatorService.refreshFallback", err);
    if (!latestSnapshots.length || input.allowStale !== true) return null;
    return buildContextFromStoredSnapshots({ snapshots: latestSnapshots, config });
  }
}

export async function listMarketIndicatorHistorySeries(input: {
  keys: DaaMarketIndicatorKey[];
  days: number;
  scope?: DaaMarketIndicatorScope;
}): Promise<Record<DaaMarketIndicatorKey, DaaMarketIndicatorSnapshot[]>> {
  const rows = await listDaaMarketIndicatorHistory({
    keys: input.keys,
    days: input.days,
    scope: input.scope,
  });
  const grouped = {} as Record<DaaMarketIndicatorKey, DaaMarketIndicatorSnapshot[]>;
  for (const key of MARKET_INDICATOR_KEYS) grouped[key] = [];
  for (const row of rows) {
    grouped[row.key].push(mapStoredIndicatorSnapshotToView(row));
  }
  return grouped;
}
