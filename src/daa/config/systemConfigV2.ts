import {
  normalizeBaseCurrencyCodeV2,
  normalizeCurrencyPairTokenV2,
  type CurrencyCodeV2,
} from "@/src/daa/config/currencyV2";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";

export type DaaFundKindV2 = "equity" | "qdii" | "balanced";

export type DaaStrategyExecutionTimingV2 = "t_plus_1_close";

export type DaaStrategyExecutionConfigV2 = {
  feeRateBps: number;
  slippageBps: number;
  timing: DaaStrategyExecutionTimingV2;
};

export type DaaHfFundTrackV2 = {
  fundCode: string;
  label: string;
  kind: DaaFundKindV2;
  enabled: boolean;
};

export type DaaMarketIndicatorConfigKeyV2 = "vix" | "qqqSpyRatio" | "fxiVolatility" | "kwebFxiRatio" | "btcEthRatio" | "btcVolatility" | "goldSilverRatio";

export type DaaMarketIndicatorConfigItemV2 = {
  enabled: boolean;
  weight: number;
};

export type DaaMarketIndicatorsConfigV2 = {
  id: string;
  enabled: boolean;
  refreshIntervalMinutes: number;
  indicators: Record<DaaMarketIndicatorConfigKeyV2, DaaMarketIndicatorConfigItemV2>;
  overlays: {
    transitionalBuyScale: number;
    riskOffBuyScale: number;
    highRiskBuyScale: number;
  };
};

export type DaaSystemConfigV2 = {
  strategy: {
    account: {
      baseCurrency: CurrencyCodeV2;
      cash: number;
      investableCash: number;
      frozenCash: number;
      totalEquity: number | null;
    };
    constraints: {
      maxPositionPct: number;
      minNotional: number;
      maxOrderPctOfNav: number;
      tradeFeeRateBps?: number;
    };
    execution: DaaStrategyExecutionConfigV2;
    policy: {
      baseDriftTriggerPct: number;
      strongTrendDriftTriggerPct: number;
      riskOffConsensusPct: number;
      riskOffScalePct: number;
      valueTrapThesisDriftPct: number;
      sbIsolationScorePct: number;
    };
    risk: {
      maxDrawdownPct: number;
      perAssetStopLossPct: number;
      perAssetTakeProfitPct: number;
      maxConcentrationPct: number;
      correlationCapPct: number;
      maxTotalRiskExposurePct: number;
      enforceOnExecution: boolean;
    };
    targetWeights: Record<string, number>;
  };
  rebalanceStrategy: {
    calendar: {
      enabled: boolean;
      frequency: "monthly" | "quarterly" | "semi_annual" | "annual";
      dayOfMonth: number;
    };
    drift: {
      enabled: boolean;
      thresholdPct: number;
      checkFrequency: "daily" | "weekly";
    };
    cooldownHours: number;
    analysisTimeUtc: string;
    timezone: string;
    analysisFocus: string;
    autoGenerateEnabled: boolean;
    notifyEmailTo: string;
    /** P1-2: 现金分类配置（对应 classifyCashV2 参数）*/
    cash?: {
      operationalReservePct?: number;
      idleThresholdPct?: number;
      idleCooldownDays?: number;
      lastDepositAt?: string | null;
    };
  };
  dataSources: {
    hfFund: {
      id: string;
      enabled: boolean;
      funds: DaaHfFundTrackV2[];
      marketScope: string[];
    };
    priceFeed: {
      id: string;
      enabled: boolean;
      provider: string;
      intervalMinutes: number;
      symbols: string[];
      marketCache: {
        freshMinutes: number;
        serveStaleHours: number;
        rawRetentionDays: number;
      };
    };
    newsFeed: {
      id: string;
      enabled: boolean;
      provider: string;
      query: string;
      symbols: string[];
      valuationEnabled: boolean;
      fusionWeights: {
        human: number;
        news: number;
        technical: number;
        valuation: number;
      };
    };
    fxFeed: {
      id: string;
      enabled: boolean;
      provider: string;
      baseCurrency: CurrencyCodeV2;
      pairs: string[];
    };
    llmAnalysis: {
      id: string;
      enabled: boolean;
      provider: string;
      model: string;
      timeoutMs: number;
      enabledInDecision: boolean;
    };
    marketIndicators: DaaMarketIndicatorsConfigV2;
  };
  notification: {
    email: {
      recipient: string;
      onSuggestionGenerated: boolean;
      dailyReport: boolean;
    };
    telegram: {
      enabled: boolean;
      onDriftTrigger: boolean;
      onTradeExecuted: boolean;
    };
  };
};

export type DaaSystemConfigEnvelopeV2 = {
  version: number;
  updatedAt: string;
  config: DaaSystemConfigV2;
};

export type DaaSystemConfigPatchV2 = {
  path: string;
  value: unknown;
};

const DEFAULT_HF_FUNDS_V2: DaaHfFundTrackV2[] = [
  { fundCode: "006533", label: "易方达科融混合", kind: "equity", enabled: true },
  { fundCode: "100055", label: "富国全球科技互联网", kind: "qdii", enabled: true },
  { fundCode: "005827", label: "易方达蓝筹精选", kind: "equity", enabled: true },
  { fundCode: "110011", label: "易方达中小盘", kind: "equity", enabled: true },
  { fundCode: "161725", label: "招商中证白酒指数", kind: "equity", enabled: true },
  { fundCode: "000248", label: "汇添富中证主要消费ETF联接", kind: "equity", enabled: true },
  { fundCode: "005918", label: "工银前沿医疗股票", kind: "equity", enabled: true },
  { fundCode: "486001", label: "工银全球精选股票QDII", kind: "qdii", enabled: true },
  { fundCode: "000834", label: "大成景安短融债券", kind: "balanced", enabled: true },
  { fundCode: "000874", label: "广发全球精选股票QDII", kind: "qdii", enabled: true },
];

export const DEFAULT_SYSTEM_CONFIG_V2: DaaSystemConfigV2 = {
  strategy: {
    account: {
      baseCurrency: "USD",
      cash: 0,
      investableCash: 0,
      frozenCash: 0,
      totalEquity: null,
    },
    constraints: {
      maxPositionPct: 0.3,
      minNotional: 200,
      maxOrderPctOfNav: 0.1,
      tradeFeeRateBps: 5,
    },
    execution: {
      feeRateBps: 5,
      slippageBps: 0,
      timing: "t_plus_1_close",
    },
    policy: {
      baseDriftTriggerPct: 0.05,
      strongTrendDriftTriggerPct: 0.1,
      riskOffConsensusPct: 0.6,
      riskOffScalePct: 0.7,
      valueTrapThesisDriftPct: 0.12,
      sbIsolationScorePct: 0.35,
    },
    risk: {
      maxDrawdownPct: 0.15,
      perAssetStopLossPct: 0.2,
      perAssetTakeProfitPct: 0.25,
      maxConcentrationPct: 0.3,
      correlationCapPct: 0.6,
      maxTotalRiskExposurePct: 0.7,
      enforceOnExecution: true,
    },
    targetWeights: {},
  },
  rebalanceStrategy: {
    calendar: {
      enabled: true,
      frequency: "monthly",
      dayOfMonth: 1,
    },
    drift: {
      enabled: true,
      thresholdPct: 0.05,
      checkFrequency: "daily",
    },
    cooldownHours: 72,
    analysisTimeUtc: "00:20",
    timezone: "Asia/Shanghai",
    analysisFocus: DEFAULT_ANALYSIS_FOCUS_V1,
    autoGenerateEnabled: false,
    notifyEmailTo: "",
  },
  dataSources: {
    hfFund: {
      id: "hf_fund.default",
      enabled: true,
      funds: DEFAULT_HF_FUNDS_V2,
      marketScope: ["US", "HK", "CN"],
    },
    priceFeed: {
      id: "price_feed.default",
      enabled: true,
      provider: "yfinance",
      intervalMinutes: 5,
      symbols: ["SPY", "QQQ", "BND", "TSLA"],
      marketCache: {
        freshMinutes: 15,
        serveStaleHours: 48,
        rawRetentionDays: 90,
      },
    },
    newsFeed: {
      id: "news_feed.default",
      enabled: true,
      provider: "yahoo_rss",
      query: "SPY OR QQQ OR TSLA",
      symbols: [],
      valuationEnabled: true,
      fusionWeights: {
        human: 0.35,
        news: 0.2,
        technical: 0.25,
        valuation: 0.2,
      },
    },
    fxFeed: {
      id: "fx_feed.default",
      enabled: true,
      provider: "manual",
      baseCurrency: "USD",
      pairs: ["USD/CNY", "USD/HKD", "USD/USDT"],
    },
    llmAnalysis: {
      id: "llm_analysis.default",
      enabled: true,
      provider: "codex",
      model: "gpt-5-codex",
      timeoutMs: 8000,
      enabledInDecision: true,
    },
    marketIndicators: {
      id: "market_indicators.default",
      enabled: true,
      refreshIntervalMinutes: 30,
      indicators: {
        vix: { enabled: true, weight: 0.55 },
        qqqSpyRatio: { enabled: true, weight: 0.45 },
        fxiVolatility: { enabled: true, weight: 0.55 },
        kwebFxiRatio: { enabled: true, weight: 0.45 },
        btcEthRatio: { enabled: true, weight: 0.5 },
        btcVolatility: { enabled: true, weight: 0.5 },
        goldSilverRatio: { enabled: true, weight: 1 },
      },
      overlays: {
        transitionalBuyScale: 0.85,
        riskOffBuyScale: 0.7,
        highRiskBuyScale: 0.55,
      },
    },
  },
  notification: {
    email: {
      recipient: "",
      onSuggestionGenerated: false,
      dailyReport: false,
    },
    telegram: {
      enabled: false,
      onDriftTrigger: false,
      onTradeExecuted: false,
    },
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["1", "true", "on", "yes"].includes(text)) return true;
    if (["0", "false", "off", "no"].includes(text)) return false;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSymbols(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const item of input) {
    const value = String(item || "").trim().toUpperCase();
    if (value) out.add(value);
  }
  return [...out];
}

function normalizeFundRows(input: unknown): DaaHfFundTrackV2[] {
  if (!Array.isArray(input)) return [];
  const out = new Map<string, DaaHfFundTrackV2>();
  for (const row of input) {
    const rec = isRecord(row) ? row : {};
    const fundCode = String(rec.fundCode || "").trim();
    if (!fundCode) continue;
    const kindRaw = String(rec.kind || "equity").trim();
    const kind: DaaFundKindV2 = kindRaw === "qdii" || kindRaw === "balanced" ? kindRaw : "equity";
    out.set(fundCode, {
      fundCode,
      label: String(rec.label || `基金 ${fundCode}`).trim() || `基金 ${fundCode}`,
      kind,
      enabled: toBool(rec.enabled, true),
    });
  }
  return [...out.values()];
}

function normalizeFusionWeights(input: unknown): DaaSystemConfigV2["dataSources"]["newsFeed"]["fusionWeights"] {
  const source = isRecord(input) ? input : {};
  const defaultWeights = { human: 0.35, news: 0.2, technical: 0.25, valuation: 0.2 };
  const human = Math.max(0, Number(source.human ?? defaultWeights.human) || 0);
  const news = Math.max(0, Number(source.news ?? defaultWeights.news) || 0);
  const technical = Math.max(0, Number(source.technical ?? defaultWeights.technical) || 0);
  const valuationRaw = Number(source.valuation);
  const hasValuation = Number.isFinite(valuationRaw);
  const valuation = hasValuation ? Math.max(0, valuationRaw) : Number.NaN;

  if (hasValuation) {
    const sum = human + news + technical + valuation;
    if (!(sum > 0)) return defaultWeights;
    return {
      human: human / sum,
      news: news / sum,
      technical: technical / sum,
      valuation: valuation / sum,
    };
  }

  const legacySum = human + news + technical;
  if (!(legacySum > 0)) return defaultWeights;
  return {
    human: (human / legacySum) * 0.85,
    news: (news / legacySum) * 0.85,
    technical: (technical / legacySum) * 0.85,
    valuation: 0.15,
  };
}

const MARKET_INDICATOR_CONFIG_KEYS_V2: DaaMarketIndicatorConfigKeyV2[] = [
  "vix",
  "qqqSpyRatio",
  "fxiVolatility",
  "kwebFxiRatio",
  "btcEthRatio",
  "btcVolatility",
  "goldSilverRatio",
];

function normalizeMarketIndicatorWeights(
  input: unknown,
  fallback: DaaMarketIndicatorsConfigV2["indicators"],
): DaaMarketIndicatorsConfigV2["indicators"] {
  const source = isRecord(input) ? input : {};
  const out = {} as DaaMarketIndicatorsConfigV2["indicators"];
  let positiveWeightCount = 0;
  for (const key of MARKET_INDICATOR_CONFIG_KEYS_V2) {
    const row = isRecord(source[key]) ? source[key] : {};
    const fallbackRow = fallback[key];
    const weight = Math.max(0, Number(row.weight ?? fallbackRow.weight) || 0);
    if (weight > 0) positiveWeightCount += 1;
    out[key] = {
      enabled: toBool(row.enabled, fallbackRow.enabled),
      weight,
    };
  }
  if (positiveWeightCount > 0) return out;
  return clone(fallback);
}

function normalizeMarketIndicatorConfig(
  input: unknown,
  fallback: DaaMarketIndicatorsConfigV2,
): DaaMarketIndicatorsConfigV2 {
  const source = isRecord(input) ? input : {};
  const overlays = isRecord(source.overlays) ? source.overlays : {};
  return {
    id: String(source.id || fallback.id).trim() || fallback.id,
    enabled: toBool(source.enabled, fallback.enabled),
    refreshIntervalMinutes: Math.max(
      5,
      Math.min(1440, Math.trunc(Number(source.refreshIntervalMinutes) || fallback.refreshIntervalMinutes)),
    ),
    indicators: normalizeMarketIndicatorWeights(source.indicators, fallback.indicators),
    overlays: {
      transitionalBuyScale: clamp(
        Number(overlays.transitionalBuyScale) || fallback.overlays.transitionalBuyScale,
        0.2,
        1,
      ),
      riskOffBuyScale: clamp(
        Number(overlays.riskOffBuyScale) || fallback.overlays.riskOffBuyScale,
        0.2,
        1,
      ),
      highRiskBuyScale: clamp(
        Number(overlays.highRiskBuyScale) || fallback.overlays.highRiskBuyScale,
        0.1,
        1,
      ),
    },
  };
}

function normalizePairs(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const item of input) {
    const token = normalizeCurrencyPairTokenV2(item);
    if (/^[A-Z]{3}\/[A-Z]{3}$/.test(token)) out.add(token);
  }
  return [...out];
}

function normalizeTargetWeights(input: unknown): Record<string, number> {
  const source = isRecord(input) ? input : {};
  const out: Record<string, number> = {};
  for (const [symbolRaw, weightRaw] of Object.entries(source)) {
    const symbol = String(symbolRaw || "").trim().toUpperCase();
    if (!symbol) continue;
    const weight = Number(weightRaw);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    out[symbol] = clamp(weight, 0, 1);
  }
  return out;
}

function normalizeCalendarFrequency(
  value: unknown,
  fallback: DaaSystemConfigV2["rebalanceStrategy"]["calendar"]["frequency"],
): DaaSystemConfigV2["rebalanceStrategy"]["calendar"]["frequency"] {
  const text = String(value || "").trim().toLowerCase();
  if (text === "quarterly") return "quarterly";
  if (text === "semi_annual" || text === "semi-annual" || text === "semiannual") return "semi_annual";
  if (text === "annual" || text === "yearly") return "annual";
  if (text === "monthly") return "monthly";
  return fallback;
}

function normalizeCheckFrequency(
  value: unknown,
  fallback: DaaSystemConfigV2["rebalanceStrategy"]["drift"]["checkFrequency"],
): DaaSystemConfigV2["rebalanceStrategy"]["drift"]["checkFrequency"] {
  const text = String(value || "").trim().toLowerCase();
  if (text === "weekly") return "weekly";
  if (text === "daily") return "daily";
  return fallback;
}

function normalizeDayOfMonth(value: unknown, fallback: number): number {
  const day = Number(value);
  if (!Number.isFinite(day)) return fallback;
  return Math.max(1, Math.min(28, Math.trunc(day)));
}

function normalizeAnalysisTimeUtc(value: unknown, fallback: string): string {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!matched) return fallback;
  return `${matched[1]}:${matched[2]}`;
}

function normalizeStrategyExecutionTimingV2(value: unknown, fallback: DaaStrategyExecutionTimingV2 = "t_plus_1_close"): DaaStrategyExecutionTimingV2 {
  const text = String(value || "").trim().toLowerCase();
  if (text === "t_plus_1_close") return "t_plus_1_close";
  return fallback;
}

export function getStrategyExecutionConfigV2(config: Pick<DaaSystemConfigV2, "strategy">): DaaStrategyExecutionConfigV2 & {
  maxOrderPctOfNav: number;
} {
  const fallback = DEFAULT_SYSTEM_CONFIG_V2.strategy;
  const execution = config.strategy.execution || fallback.execution;
  const constraints = config.strategy.constraints || fallback.constraints;
  const feeRateBpsRaw = Number(execution.feeRateBps);
  const legacyFeeRateBpsRaw = Number(constraints.tradeFeeRateBps);

  return {
    maxOrderPctOfNav: clamp(Number(constraints.maxOrderPctOfNav), 0.01, 1),
    feeRateBps: clamp(
      Number.isFinite(feeRateBpsRaw) ? feeRateBpsRaw : (Number.isFinite(legacyFeeRateBpsRaw) ? legacyFeeRateBpsRaw : fallback.execution.feeRateBps),
      0,
      500,
    ),
    slippageBps: clamp(Number(execution.slippageBps), 0, 500),
    timing: normalizeStrategyExecutionTimingV2(execution.timing, fallback.execution.timing),
  };
}

export function normalizeSystemConfigV2(raw: unknown): DaaSystemConfigV2 {
  const fallback = clone(DEFAULT_SYSTEM_CONFIG_V2);
  const source = isRecord(raw) ? raw : {};

  const strategy = isRecord(source.strategy) ? source.strategy : {};
  const account = isRecord(strategy.account) ? strategy.account : {};
  const constraints = isRecord(strategy.constraints) ? strategy.constraints : {};
  const execution = isRecord(strategy.execution) ? strategy.execution : {};
  const policy = isRecord(strategy.policy) ? strategy.policy : {};
  const risk = isRecord(strategy.risk) ? strategy.risk : {};

  const rebalanceStrategy = isRecord(source.rebalanceStrategy) ? source.rebalanceStrategy : {};
  const calendar = isRecord(rebalanceStrategy.calendar) ? rebalanceStrategy.calendar : {};
  const drift = isRecord(rebalanceStrategy.drift) ? rebalanceStrategy.drift : {};

  const dataSources = isRecord(source.dataSources) ? source.dataSources : {};
  const hfFund = isRecord(dataSources.hfFund) ? dataSources.hfFund : {};
  const priceFeed = isRecord(dataSources.priceFeed) ? dataSources.priceFeed : {};
  const priceFeedMarketCache = isRecord(priceFeed.marketCache) ? priceFeed.marketCache : {};
  const newsFeed = isRecord(dataSources.newsFeed) ? dataSources.newsFeed : {};
  const fxFeed = isRecord(dataSources.fxFeed) ? dataSources.fxFeed : {};
  const llmAnalysis = isRecord(dataSources.llmAnalysis) ? dataSources.llmAnalysis : {};
  const marketIndicators = isRecord(dataSources.marketIndicators) ? dataSources.marketIndicators : {};

  const notification = isRecord(source.notification) ? source.notification : {};
  const notificationEmail = isRecord(notification.email) ? notification.email : {};
  const notificationTelegram = isRecord(notification.telegram) ? notification.telegram : {};

  const legacyAutomation = isRecord(source.automation) ? source.automation : {};
  const legacyDailyAnalysis = isRecord(legacyAutomation.dailyAnalysis) ? legacyAutomation.dailyAnalysis : {};
  const legacyNotification = isRecord(source.notification) ? source.notification : {};

  const normalized: DaaSystemConfigV2 = {
    strategy: {
      account: {
        baseCurrency: normalizeBaseCurrencyCodeV2(account.baseCurrency, fallback.strategy.account.baseCurrency),
        cash: Math.max(0, Number(account.cash) || 0),
        investableCash: Math.max(0, Number(account.investableCash) || 0),
        frozenCash: Math.max(0, Number(account.frozenCash) || 0),
        totalEquity: account.totalEquity == null ? null : Math.max(0, Number(account.totalEquity) || 0),
      },
      constraints: {
        maxPositionPct: clamp(Number(constraints.maxPositionPct) || fallback.strategy.constraints.maxPositionPct, 0.01, 1),
        minNotional: toPositiveNumber(constraints.minNotional, fallback.strategy.constraints.minNotional),
        maxOrderPctOfNav: clamp(Number(constraints.maxOrderPctOfNav) || fallback.strategy.constraints.maxOrderPctOfNav, 0.01, 1),
        tradeFeeRateBps: clamp(
          Number.isFinite(Number(constraints.tradeFeeRateBps))
            ? Number(constraints.tradeFeeRateBps)
            : Number(fallback.strategy.constraints.tradeFeeRateBps || 5),
          0,
          500,
        ),
      },
      execution: {
        feeRateBps: clamp(
          Number.isFinite(Number(execution.feeRateBps))
            ? Number(execution.feeRateBps)
            : (
              Number.isFinite(Number(constraints.tradeFeeRateBps))
                ? Number(constraints.tradeFeeRateBps)
                : fallback.strategy.execution.feeRateBps
            ),
          0,
          500,
        ),
        slippageBps: clamp(Number(execution.slippageBps) || fallback.strategy.execution.slippageBps, 0, 500),
        timing: normalizeStrategyExecutionTimingV2(execution.timing, fallback.strategy.execution.timing),
      },
      policy: {
        baseDriftTriggerPct: clamp(Number(policy.baseDriftTriggerPct) || fallback.strategy.policy.baseDriftTriggerPct, 0.01, 0.5),
        strongTrendDriftTriggerPct: clamp(Number(policy.strongTrendDriftTriggerPct) || fallback.strategy.policy.strongTrendDriftTriggerPct, 0.01, 0.5),
        riskOffConsensusPct: clamp(Number(policy.riskOffConsensusPct) || fallback.strategy.policy.riskOffConsensusPct, 0.1, 1),
        riskOffScalePct: clamp(Number(policy.riskOffScalePct) || fallback.strategy.policy.riskOffScalePct, 0.1, 1),
        valueTrapThesisDriftPct: clamp(Number(policy.valueTrapThesisDriftPct) || fallback.strategy.policy.valueTrapThesisDriftPct, 0.01, 0.5),
        sbIsolationScorePct: clamp(Number(policy.sbIsolationScorePct) || fallback.strategy.policy.sbIsolationScorePct, 0.1, 0.8),
      },
      risk: {
        maxDrawdownPct: clamp(Number(risk.maxDrawdownPct) || fallback.strategy.risk.maxDrawdownPct, 0.05, 0.5),
        perAssetStopLossPct: clamp(Number(risk.perAssetStopLossPct) || fallback.strategy.risk.perAssetStopLossPct, 0.05, 0.5),
        perAssetTakeProfitPct: clamp(
          Number(risk.perAssetTakeProfitPct) || fallback.strategy.risk.perAssetTakeProfitPct,
          0.05,
          1.5,
        ),
        maxConcentrationPct: clamp(Number(risk.maxConcentrationPct) || fallback.strategy.risk.maxConcentrationPct, 0.1, 1),
        correlationCapPct: clamp(Number(risk.correlationCapPct) || fallback.strategy.risk.correlationCapPct, 0.1, 1),
        maxTotalRiskExposurePct: clamp(Number(risk.maxTotalRiskExposurePct) || fallback.strategy.risk.maxTotalRiskExposurePct, 0.1, 1),
        enforceOnExecution: toBool(risk.enforceOnExecution, fallback.strategy.risk.enforceOnExecution),
      },
      targetWeights: normalizeTargetWeights(strategy.targetWeights),
    },
    rebalanceStrategy: {
      calendar: {
        enabled: toBool(calendar.enabled, fallback.rebalanceStrategy.calendar.enabled),
        frequency: normalizeCalendarFrequency(calendar.frequency, fallback.rebalanceStrategy.calendar.frequency),
        dayOfMonth: normalizeDayOfMonth(calendar.dayOfMonth, fallback.rebalanceStrategy.calendar.dayOfMonth),
      },
      drift: {
        enabled: toBool(drift.enabled, fallback.rebalanceStrategy.drift.enabled),
        thresholdPct: clamp(Number(drift.thresholdPct) || fallback.rebalanceStrategy.drift.thresholdPct, 0.01, 0.5),
        checkFrequency: normalizeCheckFrequency(drift.checkFrequency, fallback.rebalanceStrategy.drift.checkFrequency),
      },
      cooldownHours: Math.max(1, Math.trunc(Number(rebalanceStrategy.cooldownHours) || fallback.rebalanceStrategy.cooldownHours)),
      analysisTimeUtc: normalizeAnalysisTimeUtc(
        rebalanceStrategy.analysisTimeUtc ?? legacyDailyAnalysis.analysisTimeUtc,
        fallback.rebalanceStrategy.analysisTimeUtc,
      ),
      timezone: String(rebalanceStrategy.timezone || legacyDailyAnalysis.timezone || fallback.rebalanceStrategy.timezone).trim() || fallback.rebalanceStrategy.timezone,
      analysisFocus: String(rebalanceStrategy.analysisFocus || legacyDailyAnalysis.analysisFocus || fallback.rebalanceStrategy.analysisFocus).trim() || fallback.rebalanceStrategy.analysisFocus,
      autoGenerateEnabled: toBool(
        rebalanceStrategy.autoGenerateEnabled,
        toBool(legacyDailyAnalysis.enabled, fallback.rebalanceStrategy.autoGenerateEnabled),
      ),
      notifyEmailTo: String(rebalanceStrategy.notifyEmailTo || legacyDailyAnalysis.emailTo || fallback.rebalanceStrategy.notifyEmailTo).trim(),
    },
    dataSources: {
      hfFund: {
        id: String(hfFund.id || fallback.dataSources.hfFund.id).trim() || fallback.dataSources.hfFund.id,
        enabled: toBool(hfFund.enabled, fallback.dataSources.hfFund.enabled),
        funds: normalizeFundRows(hfFund.funds).length ? normalizeFundRows(hfFund.funds) : clone(fallback.dataSources.hfFund.funds),
        marketScope: normalizeSymbols(hfFund.marketScope).length ? normalizeSymbols(hfFund.marketScope) : clone(fallback.dataSources.hfFund.marketScope),
      },
      priceFeed: {
        id: String(priceFeed.id || fallback.dataSources.priceFeed.id).trim() || fallback.dataSources.priceFeed.id,
        enabled: toBool(priceFeed.enabled, fallback.dataSources.priceFeed.enabled),
        provider: String(priceFeed.provider || fallback.dataSources.priceFeed.provider).trim() || fallback.dataSources.priceFeed.provider,
        intervalMinutes: Math.max(1, Math.trunc(Number(priceFeed.intervalMinutes) || fallback.dataSources.priceFeed.intervalMinutes)),
        symbols: normalizeSymbols(priceFeed.symbols).length ? normalizeSymbols(priceFeed.symbols) : clone(fallback.dataSources.priceFeed.symbols),
        marketCache: {
          freshMinutes: Math.max(
            1,
            Math.min(180, Math.trunc(Number(priceFeedMarketCache.freshMinutes) || fallback.dataSources.priceFeed.marketCache.freshMinutes)),
          ),
          serveStaleHours: Math.max(
            1,
            Math.min(168, Math.trunc(Number(priceFeedMarketCache.serveStaleHours) || fallback.dataSources.priceFeed.marketCache.serveStaleHours)),
          ),
          rawRetentionDays: Math.max(
            7,
            Math.min(365, Math.trunc(Number(priceFeedMarketCache.rawRetentionDays) || fallback.dataSources.priceFeed.marketCache.rawRetentionDays)),
          ),
        },
      },
      newsFeed: {
        id: String(newsFeed.id || fallback.dataSources.newsFeed.id).trim() || fallback.dataSources.newsFeed.id,
        enabled: toBool(newsFeed.enabled, fallback.dataSources.newsFeed.enabled),
        provider: String(newsFeed.provider || fallback.dataSources.newsFeed.provider).trim() || fallback.dataSources.newsFeed.provider,
        query: String(newsFeed.query || fallback.dataSources.newsFeed.query).trim(),
        symbols: normalizeSymbols(newsFeed.symbols),
        valuationEnabled: toBool(newsFeed.valuationEnabled, fallback.dataSources.newsFeed.valuationEnabled),
        fusionWeights: normalizeFusionWeights(newsFeed.fusionWeights),
      },
      fxFeed: {
        id: String(fxFeed.id || fallback.dataSources.fxFeed.id).trim() || fallback.dataSources.fxFeed.id,
        enabled: toBool(fxFeed.enabled, fallback.dataSources.fxFeed.enabled),
        provider: String(fxFeed.provider || fallback.dataSources.fxFeed.provider).trim() || fallback.dataSources.fxFeed.provider,
        baseCurrency: normalizeBaseCurrencyCodeV2(fxFeed.baseCurrency, fallback.dataSources.fxFeed.baseCurrency),
        pairs: normalizePairs(fxFeed.pairs).length ? normalizePairs(fxFeed.pairs) : clone(fallback.dataSources.fxFeed.pairs),
      },
      llmAnalysis: {
        id: String(llmAnalysis.id || fallback.dataSources.llmAnalysis.id).trim() || fallback.dataSources.llmAnalysis.id,
        enabled: toBool(llmAnalysis.enabled, fallback.dataSources.llmAnalysis.enabled),
        provider: String(llmAnalysis.provider || fallback.dataSources.llmAnalysis.provider).trim() || fallback.dataSources.llmAnalysis.provider,
        model: String(llmAnalysis.model || fallback.dataSources.llmAnalysis.model).trim() || fallback.dataSources.llmAnalysis.model,
        timeoutMs: Math.max(2000, Math.trunc(Number(llmAnalysis.timeoutMs) || fallback.dataSources.llmAnalysis.timeoutMs)),
        enabledInDecision: toBool(llmAnalysis.enabledInDecision, fallback.dataSources.llmAnalysis.enabledInDecision),
      },
      marketIndicators: normalizeMarketIndicatorConfig(marketIndicators, fallback.dataSources.marketIndicators),
    },
    notification: {
      email: {
        recipient: String(notificationEmail.recipient || rebalanceStrategy.notifyEmailTo || legacyDailyAnalysis.emailTo || "").trim(),
        onSuggestionGenerated: toBool(
          notificationEmail.onSuggestionGenerated,
          toBool((legacyNotification as Record<string, unknown>).notifyOnRebalance, fallback.notification.email.onSuggestionGenerated),
        ),
        dailyReport: toBool(
          notificationEmail.dailyReport,
          toBool((legacyNotification as Record<string, unknown>).notifyOnDrift, fallback.notification.email.dailyReport),
        ),
      },
      telegram: {
        enabled: toBool(notificationTelegram.enabled, fallback.notification.telegram.enabled),
        onDriftTrigger: toBool(
          notificationTelegram.onDriftTrigger,
          toBool((legacyNotification as Record<string, unknown>).notifyOnDrift, fallback.notification.telegram.onDriftTrigger),
        ),
        onTradeExecuted: toBool(
          notificationTelegram.onTradeExecuted,
          toBool((legacyNotification as Record<string, unknown>).notifyOnRebalance, fallback.notification.telegram.onTradeExecuted),
        ),
      },
    },
  };

  return normalized;
}

function toPathSegments(pathRaw: string): string[] {
  const text = String(pathRaw || "").trim();
  if (!text) return [];
  const cleaned = text.startsWith("/") ? text.slice(1) : text;
  return cleaned.split("/").map((item) => item.trim()).filter(Boolean);
}

function applyPathValue(target: Record<string, unknown>, pathSegments: string[], value: unknown) {
  if (!pathSegments.length) return;

  let current: Record<string, unknown> = target;
  for (let i = 0; i < pathSegments.length - 1; i += 1) {
    const key = pathSegments[i];
    const next = current[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[pathSegments[pathSegments.length - 1]] = value;
}

export function applySystemConfigPatchesV2(base: DaaSystemConfigV2, patches: DaaSystemConfigPatchV2[]): DaaSystemConfigV2 {
  if (!Array.isArray(patches) || patches.length === 0) return normalizeSystemConfigV2(base);
  const draft = clone(base) as unknown as Record<string, unknown>;

  for (const patch of patches) {
    const path = toPathSegments(patch.path);
    if (!path.length) continue;
    applyPathValue(draft, path, patch.value);
  }

  return normalizeSystemConfigV2(draft);
}
