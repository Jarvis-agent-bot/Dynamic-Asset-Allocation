import type { DaaMarketIndicatorsConfigV2 } from "@/src/daa/config/systemConfigV2";
import {
  getMarketIndicatorRefreshSymbolsV1,
  getRelevantMarketIndicatorKeysForAssetV1,
  MARKET_INDICATOR_KEY_BY_CONFIG_KEY_V1,
  MARKET_INDICATOR_KEYS_V1,
  MARKET_INDICATOR_META_CATALOG_V1,
  MARKET_SCOPE_LABEL_ZH_V1,
  resolveMarketScopeForAssetV1,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalogV1";
import {
  buildMarketContextFromIndicatorsV1,
  resolveRelevantMarketScopeContextV1,
} from "@/src/daa/modules/marketContext/marketContextOverlayV1";
import type {
  DaaMarketContextAttributionV1,
  DaaMarketContextV1,
  DaaMarketIndicatorKeyV1,
  DaaMarketIndicatorScopeV1,
  DaaMarketIndicatorSnapshotV1,
  DaaMarketRegimeV1,
} from "@/src/daa/modules/marketContext/marketContextTypesV1";
import {
  getDaaSystemConfigV2,
  listDaaMarketIndicatorHistoryV1,
  listLatestDaaMarketIndicatorSnapshotsV1,
  upsertDaaMarketIndicatorSnapshotsV1,
  type DaaStoreMarketIndicatorSnapshotV1,
} from "@/src/daa/store/daaStorePgV1";
import { addDaysIsoUtc, normalizeYfinanceSymbol } from "@/src/market/yfinance";

export type RefreshMarketIndicatorsResultV1 = {
  marketContext: DaaMarketContextV1 | null;
  indicators: DaaMarketIndicatorSnapshotV1[];
  refreshedCount: number;
};

type DailyCloseBarV1 = {
  date: string;
  close: number;
};

type ComputedIndicatorRowV1 = {
  snapshot: DaaMarketIndicatorSnapshotV1;
  reasonsJson: string[];
  componentsJson: Record<string, unknown>;
  expireAt: string | null;
  scope: string;
  subjectKey: string;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function epochSecondsUtcStart(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00.000Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Number.NaN;
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

function buildRollingVolPctV1(closes: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = window; i < closes.length; i += 1) {
    const sample = closes.slice(i - window, i + 1);
    const vol = annualizedVolPctFromCloses(sample);
    if (vol != null) out.push(vol);
  }
  return out;
}

function stanceFromScore(scorePct: number): DaaMarketRegimeV1 | "neutral" {
  if (scorePct >= 65) return "risk_off";
  if (scorePct <= 35) return "risk_on";
  return "neutral";
}

async function fetchDailyCloseBarsV1(symbolRaw: string, days: number): Promise<DailyCloseBarV1[]> {
  const symbol = normalizeYfinanceSymbol(symbolRaw);
  if (!symbol) return [];
  const safeDays = Math.max(40, Math.trunc(days));
  const end = new Date().toISOString().slice(0, 10);
  const start = addDaysIsoUtc(end, -safeDays - 14);
  const period1 = epochSecondsUtcStart(start);
  const period2 = epochSecondsUtcStart(addDaysIsoUtc(end, 1));

  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set("interval", "1d");
  upstream.searchParams.set("events", "div|split");
  upstream.searchParams.set("period1", String(period1));
  upstream.searchParams.set("period2", String(period2));

  try {
    const response = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; DAA/0.1; +https://example.invalid)",
      },
    });
    if (!response.ok) return [];
    const payload = await response.json() as any;
    if (payload?.chart?.error) return [];
    const timestamps = Array.isArray(payload?.chart?.result?.[0]?.timestamp)
      ? payload.chart.result[0].timestamp
      : [];
    const closes = Array.isArray(payload?.chart?.result?.[0]?.indicators?.quote?.[0]?.close)
      ? payload.chart.result[0].indicators.quote[0].close
      : [];

    const out: DailyCloseBarV1[] = [];
    for (let i = 0; i < Math.min(timestamps.length, closes.length); i += 1) {
      const close = Number(closes[i]);
      const ts = Number(timestamps[i]);
      if (!(close > 0) || !Number.isFinite(ts)) continue;
      out.push({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        close,
      });
    }
    return out.slice(-safeDays);
  } catch {
    return [];
  }
}

function buildExpireAtV1(refreshIntervalMinutes: number, generatedAt: string): string {
  const baseMs = Date.parse(generatedAt);
  return new Date((Number.isFinite(baseMs) ? baseMs : Date.now()) + refreshIntervalMinutes * 60 * 1000).toISOString();
}

function mapStoredIndicatorSnapshotToViewV1(row: DaaStoreMarketIndicatorSnapshotV1): DaaMarketIndicatorSnapshotV1 {
  const meta = MARKET_INDICATOR_META_CATALOG_V1[row.key];
  return {
    key: row.key,
    label: meta.label,
    category: meta.category,
    scope: row.scope as DaaMarketIndicatorScopeV1,
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

function buildStoredRowPayloadV1(input: ComputedIndicatorRowV1): Partial<DaaStoreMarketIndicatorSnapshotV1> {
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

function finalizeIndicatorRowV1(input: {
  key: DaaMarketIndicatorKeyV1;
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
}): ComputedIndicatorRowV1 {
  const meta = MARKET_INDICATOR_META_CATALOG_V1[input.key];
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

async function computeVixIndicatorV1(getBars: (symbol: string, days: number) => Promise<DailyCloseBarV1[]>): Promise<ComputedIndicatorRowV1 | null> {
  const bars = await getBars("^VIX", 270);
  const closes = bars.map((item) => item.close).filter((item) => item > 0);
  if (closes.length < 30) return null;
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
  return finalizeIndicatorRowV1({
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

async function computeRatioIndicatorV1(input: {
  key: "qqq_spy_ratio" | "kweb_fxi_ratio" | "gold_silver_ratio" | "btc_eth_ratio";
  leftSymbol: string;
  rightSymbol: string;
  riskDirection: "high_is_risk_off" | "low_is_risk_off";
  highReason: string;
  lowReason: string;
  getBars: (symbol: string, days: number) => Promise<DailyCloseBarV1[]>;
}): Promise<ComputedIndicatorRowV1 | null> {
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
      : `${MARKET_INDICATOR_META_CATALOG_V1[input.key].label} 位于中性区间，风格切换不明显`;
  return finalizeIndicatorRowV1({
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

async function computeRealizedVolIndicatorV1(input: {
  key: "fxi_volatility" | "btc_volatility";
  symbol: string;
  highReason: string;
  lowReason: string;
  getBars: (symbol: string, days: number) => Promise<DailyCloseBarV1[]>;
}): Promise<ComputedIndicatorRowV1 | null> {
  const bars = await input.getBars(input.symbol, 320);
  const closes = bars.map((item) => item.close).filter((item) => item > 0);
  if (closes.length < 50) return null;
  const rollingVols = buildRollingVolPctV1(closes, 20);
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
      : `${MARKET_INDICATOR_META_CATALOG_V1[input.key].label} 位于中性区间，波动环境未见极端`;
  return finalizeIndicatorRowV1({
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

async function computeEnabledIndicatorsV1(config: DaaMarketIndicatorsConfigV2): Promise<ComputedIndicatorRowV1[]> {
  const barCache = new Map<string, Promise<DailyCloseBarV1[]>>();
  const getBars = (symbol: string, days: number) => {
    const key = `${normalizeYfinanceSymbol(symbol)}::${days}`;
    if (!barCache.has(key)) {
      barCache.set(key, fetchDailyCloseBarsV1(symbol, days));
    }
    return barCache.get(key)!;
  };

  const rows: Array<Promise<ComputedIndicatorRowV1 | null>> = [];
  if (config.indicators.vix?.enabled) {
    rows.push(computeVixIndicatorV1(getBars));
  }
  if (config.indicators.qqqSpyRatio?.enabled) {
    rows.push(computeRatioIndicatorV1({
      key: "qqq_spy_ratio",
      leftSymbol: "QQQ",
      rightSymbol: "SPY",
      riskDirection: "low_is_risk_off",
      highReason: "QQQ 相对 SPY 偏强，美股风格更偏进攻",
      lowReason: "QQQ 相对 SPY 走弱，美股风格转向防守",
      getBars,
    }));
  }
  if (config.indicators.fxiVolatility?.enabled) {
    rows.push(computeRealizedVolIndicatorV1({
      key: "fxi_volatility",
      symbol: "FXI",
      highReason: "FXI 波动率处于高位，港股 / 中概风险偏好承压",
      lowReason: "FXI 波动率回落，港股 / 中概波动环境改善",
      getBars,
    }));
  }
  if (config.indicators.kwebFxiRatio?.enabled) {
    rows.push(computeRatioIndicatorV1({
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
    rows.push(computeRatioIndicatorV1({
      key: "btc_eth_ratio",
      leftSymbol: "BTC-USD",
      rightSymbol: "ETH-USD",
      riskDirection: "high_is_risk_off",
      highReason: "BTC 相对 ETH 偏强，加密市场更偏防守",
      lowReason: "ETH 相对 BTC 偏强，加密市场风险偏好回升",
      getBars,
    }));
  }
  if (config.indicators.btcVolatility?.enabled) {
    rows.push(computeRealizedVolIndicatorV1({
      key: "btc_volatility",
      symbol: "BTC-USD",
      highReason: "BTC 波动率处于高位，加密市场情绪偏脆弱",
      lowReason: "BTC 波动率回落，加密市场波动压力缓和",
      getBars,
    }));
  }
  if (config.indicators.goldSilverRatio?.enabled) {
    rows.push(computeRatioIndicatorV1({
      key: "gold_silver_ratio",
      leftSymbol: "GC=F",
      rightSymbol: "SI=F",
      riskDirection: "high_is_risk_off",
      highReason: "金银比高位，宏观资金偏向防御资产",
      lowReason: "金银比低位，宏观防御需求有所缓和",
      getBars,
    }));
  }

  const resolved = await Promise.all(rows);
  const expireAt = buildExpireAtV1(config.refreshIntervalMinutes, new Date().toISOString());
  return resolved
    .filter((item): item is ComputedIndicatorRowV1 => Boolean(item))
    .map((item) => ({ ...item, expireAt }));
}

function hasFreshCoverageV1(input: {
  snapshots: DaaStoreMarketIndicatorSnapshotV1[];
  config: DaaMarketIndicatorsConfigV2;
  allowStale: boolean;
}): boolean {
  const nowMs = Date.now();
  return Object.entries(input.config.indicators).every(([configKey, row]) => {
    if (!row?.enabled) return true;
    const key = MARKET_INDICATOR_KEY_BY_CONFIG_KEY_V1[configKey as keyof DaaMarketIndicatorsConfigV2["indicators"]];
    const snapshot = input.snapshots.find((item) => item.key === key);
    if (!snapshot) return false;
    if (input.allowStale) return true;
    if (!snapshot.expireAt) return true;
    const expireMs = Date.parse(snapshot.expireAt);
    return Number.isFinite(expireMs) && expireMs > nowMs;
  });
}

function buildContextFromStoredSnapshotsV1(input: {
  snapshots: DaaStoreMarketIndicatorSnapshotV1[];
  config: DaaMarketIndicatorsConfigV2;
}): DaaMarketContextV1 | null {
  const views = input.snapshots.map((item) => mapStoredIndicatorSnapshotToViewV1(item));
  return buildMarketContextFromIndicatorsV1({ indicators: views, config: input.config });
}

export function marketRegimeLabelZhV1(regime: DaaMarketRegimeV1 | null | undefined): string {
  if (regime === "risk_on") return "偏进攻";
  if (regime === "risk_off") return "偏防守";
  if (regime === "transitional") return "中性过渡";
  return "未知";
}

export function marketScopeLabelZhV1(scope: DaaMarketIndicatorScopeV1 | null | undefined): string {
  if (!scope) return "组合";
  return MARKET_SCOPE_LABEL_ZH_V1[scope] || "组合";
}

export async function refreshMarketIndicatorsV1(): Promise<RefreshMarketIndicatorsResultV1> {
  const system = await getDaaSystemConfigV2();
  const config = system.config.dataSources.marketIndicators;
  if (!config.enabled) {
    return { marketContext: null, indicators: [], refreshedCount: 0 };
  }

  const computed = await computeEnabledIndicatorsV1(config);
  if (computed.length <= 0) {
    return { marketContext: null, indicators: [], refreshedCount: 0 };
  }

  const refreshedCount = await upsertDaaMarketIndicatorSnapshotsV1(computed.map((item) => buildStoredRowPayloadV1(item)));
  const indicators = computed.map((item) => item.snapshot);
  const marketContext = buildMarketContextFromIndicatorsV1({ indicators, config });
  return { marketContext, indicators, refreshedCount };
}

export async function getCurrentMarketContextV1(input: {
  forceRefresh?: boolean;
  allowStale?: boolean;
} = {}): Promise<DaaMarketContextV1 | null> {
  const system = await getDaaSystemConfigV2();
  const config = system.config.dataSources.marketIndicators;
  if (!config.enabled) return null;

  if (input.forceRefresh) {
    try {
      return (await refreshMarketIndicatorsV1()).marketContext;
    } catch {
      // fallback to stored snapshots below
    }
  }

  const latestSnapshots = await listLatestDaaMarketIndicatorSnapshotsV1();
  if (latestSnapshots.length > 0 && hasFreshCoverageV1({ snapshots: latestSnapshots, config, allowStale: input.allowStale === true })) {
    return buildContextFromStoredSnapshotsV1({ snapshots: latestSnapshots, config });
  }

  try {
    return (await refreshMarketIndicatorsV1()).marketContext;
  } catch {
    if (!latestSnapshots.length || input.allowStale !== true) return null;
    return buildContextFromStoredSnapshotsV1({ snapshots: latestSnapshots, config });
  }
}

export async function listMarketIndicatorHistorySeriesV1(input: {
  keys: DaaMarketIndicatorKeyV1[];
  days: number;
  scope?: DaaMarketIndicatorScopeV1;
}): Promise<Record<DaaMarketIndicatorKeyV1, DaaMarketIndicatorSnapshotV1[]>> {
  const rows = await listDaaMarketIndicatorHistoryV1({
    keys: input.keys,
    days: input.days,
    scope: input.scope,
  });
  const grouped = {} as Record<DaaMarketIndicatorKeyV1, DaaMarketIndicatorSnapshotV1[]>;
  for (const key of MARKET_INDICATOR_KEYS_V1) grouped[key] = [];
  for (const row of rows) {
    grouped[row.key].push(mapStoredIndicatorSnapshotToViewV1(row));
  }
  return grouped;
}

export function buildMarketContextAttributionV1(input: {
  symbol: string;
  market?: string;
  assetClass?: string;
  marketGroup?: string;
  instrumentType?: string;
  region?: string;
  exchange?: string;
  holdingTags?: string[];
  watchTags?: string[];
  marketContext: DaaMarketContextV1 | null;
}): DaaMarketContextAttributionV1 | null {
  if (!input.marketContext) return null;
  const scope = resolveMarketScopeForAssetV1(input);
  const scopeLabel = marketScopeLabelZhV1(scope);
  const scopeContext = resolveRelevantMarketScopeContextV1({
    marketContext: input.marketContext,
    symbol: input.symbol,
    market: input.market,
    assetClass: input.assetClass,
    marketGroup: input.marketGroup,
    instrumentType: input.instrumentType,
    region: input.region,
    exchange: input.exchange,
    holdingTags: input.holdingTags,
    watchTags: input.watchTags,
  }) || null;
  const relevantKeys = getRelevantMarketIndicatorKeysForAssetV1(input);
  const indicatorMap = new Map((scopeContext?.indicators || input.marketContext.indicators).map((item) => [item.key, item]));
  const explanation: string[] = [];

  if (scopeContext) {
    explanation.push(
      `${scopeLabel}当前处于 ${marketRegimeLabelZhV1(scopeContext.regime)}，普通买入执行 ${Math.round(scopeContext.buyScale * 100)}%，高波动买入执行 ${Math.round(scopeContext.highRiskBuyScale * 100)}%。`,
    );
  } else {
    explanation.push(
      `当前组合摘要处于 ${marketRegimeLabelZhV1(input.marketContext.regime)}，风险分 ${input.marketContext.riskOffScorePct.toFixed(1)}。`,
    );
  }

  for (const key of relevantKeys) {
    const indicator = indicatorMap.get(key);
    if (!indicator) continue;
    explanation.push(`${indicator.label}：${indicator.reason}`);
  }
  if (explanation.length === 1) {
    explanation.push(...(scopeContext?.reasons || input.marketContext.reasons).slice(0, 2));
  }

  return {
    scope,
    scopeLabel,
    relevantKeys,
    explanation: explanation.slice(0, 4),
    buyScale: scopeContext?.buyScale ?? null,
    highRiskBuyScale: scopeContext?.highRiskBuyScale ?? null,
  };
}

export async function getMarketIndicatorRefreshTargetsV1(): Promise<string[]> {
  const system = await getDaaSystemConfigV2();
  return getMarketIndicatorRefreshSymbolsV1(system.config.dataSources.marketIndicators);
}
