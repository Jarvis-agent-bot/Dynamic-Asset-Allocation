import { clamp } from "@/src/core/math";
import {
  normalizeBaseCurrencyCode,
  normalizeCurrencyPairToken,
  type CurrencyCode,
} from "@/src/daa/config/currency";
import { DEFAULT_ANALYSIS_FOCUS_ } from "@/src/daa/llm/analysisFocusDefaults";

type DaaFundKind = "equity" | "qdii" | "balanced";

type DaaStrategyExecutionTiming = "t_plus_1_close";

type DaaStrategyExecutionConfig = {
  feeRateBps: number;
  slippageBps: number;
  timing: DaaStrategyExecutionTiming;
};

type DaaHfFundTrack = {
  fundCode: string;
  label: string;
  kind: DaaFundKind;
  enabled: boolean;
};

export type DaaMarketIndicatorConfigKey = "vix" | "qqqSpyRatio" | "fxiVolatility" | "kwebFxiRatio" | "btcEthRatio" | "btcVolatility" | "goldSilverRatio" | "yieldCurveSpread" | "usdStrength" | "creditSpread" | "inflationExpectation" | "marketBreadth";

type DaaMarketIndicatorConfigItem = {
  enabled: boolean;
  weight: number;
};

export type DaaMarketIndicatorsConfig = {
  id: string;
  enabled: boolean;
  refreshIntervalMinutes: number;
  indicators: Record<DaaMarketIndicatorConfigKey, DaaMarketIndicatorConfigItem>;
  overlays: {
    transitionalBuyScale: number;
    riskOffBuyScale: number;
    highRiskBuyScale: number;
  };
};

// ─── Strategy Params（可调参数，从硬编码提取为配置）─────────────────────

export type DaaStrategyParams = {
  signalFusion: {
    /** 冲突惩罚 [人因vs技术, 新闻vs技术, 人因弱+技术强, 技术强+估值贵, 技术弱+估值便宜] */
    conflictPenalties: [number, number, number, number, number];
    maxConflictPenalty: number;
    conflictConfidenceImpact: number;
    actionThresholds: {
      openOrAdd: { score: number; confidence: number };
      watch: { score: number; confidence: number };
    };
    confidenceWeights: { human: number; news: number; technical: number; valuation: number };
    macroCycleAdjustments: Record<string, number>;
  };
  marketRegime: {
    riskOffThreshold: number;
    riskOnThreshold: number;
  };
};

export type DaaSystemConfig = {
  strategy: {
    account: {
      baseCurrency: CurrencyCode;
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
    execution: DaaStrategyExecutionConfig;
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
    /** 可调策略参数（信号融合、决策融合、市场环境阈值） */
    strategyParams?: Partial<DaaStrategyParams>;
  };
  rebalanceStrategy: {
    calendar: {
      enabled: boolean;
      frequency: "every_3_days" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "annual";
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
    /** 自动驾驶：风控通过后自动执行再平衡（需同时开启 autoGenerateEnabled） */
    autoExecuteEnabled?: boolean;
    /** 单次自动执行最大占 NAV 百分比（默认 10%） */
    autoExecuteMaxSinglePct?: number;
    /** P1-2: 现金分类配置（对应 classifyCash 参数）*/
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
      funds: DaaHfFundTrack[];
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
      baseCurrency: CurrencyCode;
      pairs: string[];
    };
    llmAnalysis: {
      id: string;
      enabled: boolean;
      provider: string;
      model: string;
      timeoutMs: number;
      enabledInDecision: boolean;
      /** 自定义 endpoint（为空时使用 provider 默认值） */
      endpoint?: string;
    };
    marketIndicators: DaaMarketIndicatorsConfig;
  };
  /** 认知 Agent 配置 */
  cognitiveAgent?: {
    enabled: boolean;
    /** 每次调查最大论点数（默认 3） */
    maxInvestigationTargets: number;
    /** 新论点默认复盘间隔天数（默认 14） */
    reviewIntervalDays: number;
    /** 每次调查召回记忆数（默认 5） */
    memoryRecallLimit: number;
    /** 连续 LLM 失败触发熔断的阈值（默认 3） */
    circuitBreakerThreshold: number;
    /** 运行频率 */
    schedule: "2x_daily" | "daily" | "every_6h" | "manual_only";
    /** 运行时间 UTC（如 ["13:00", "21:00"]） */
    scheduleTimesUtc: string[];
    /** 记忆衰减率 per day（默认 0.97，约 23 天半衰期） */
    memoryDecayRate: number;
    /** 记忆归档阈值（strength 低于此值不参与召回，默认 0.05） */
    memoryArchiveThreshold: number;
    /** 启用 Agent Config Overlay（LLM 生成参数建议驱动规则引擎，默认 false） */
    agentOverlayEnabled?: boolean;
    /** 允许 Agent 主动触发再平衡（默认 false） */
    agentTriggerEnabled?: boolean;
    /** medium+ conviction thesis 超过此天数未被调查时，强制占用 1 个调查槽位（默认 7 天，防止 LLM 永远只调查 uncertain） */
    thesisStalenessDays?: number;
  };
  /** 观察列表自动建仓 — 信号达标时为 watchlist 资产生成 BUY 提案 */
  watchlistEntry?: {
    /** 全局开关（默认 false，单资产还要 auto_entry_enabled 才会触发） */
    enabled: boolean;
    /** 单次 cron 最多触发的建仓数，防止现金一次耗尽 */
    maxPerCycle: number;
    /** 全局默认阈值，单资产 entry_rules_json 未覆盖时使用 */
    defaultRules: {
      minTechnicalScore: number;
      minValuationScore: number;
      minFusionScore: number;
      /** 是否要求技术面 momentumRegime=strong */
      requireStrongMomentum: boolean;
    };
    /** 单次建仓金额上限（以可用现金的百分比为上限，0-1） */
    notionalCashCapPct: number;
  };
  notification: {
    dailyAnalysisHourUtc: number;
    telegram: {
      enabled: boolean;
      onDriftTrigger: boolean;
      onSuggestionGenerated: boolean;
      onTradeExecuted: boolean;
      dailyReport: boolean;
    };
    feishu: {
      enabled: boolean;
      onDriftTrigger: boolean;
      onSuggestionGenerated: boolean;
      onTradeExecuted: boolean;
      dailyReport: boolean;
    };
  };
};

export type DaaSystemConfigPatch = {
  path: string;
  value: unknown;
};

const DEFAULT_HF_FUNDS_: DaaHfFundTrack[] = [
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

export const DEFAULT_SYSTEM_CONFIG_: DaaSystemConfig = {
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
    analysisFocus: DEFAULT_ANALYSIS_FOCUS_,
    autoGenerateEnabled: false,
    autoExecuteEnabled: false,
    autoExecuteMaxSinglePct: 10,
  },
  dataSources: {
    hfFund: {
      id: "hf_fund.default",
      enabled: true,
      funds: DEFAULT_HF_FUNDS_,
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
      provider: "deepseek",
      model: "deepseek-chat",
      timeoutMs: 15000,
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
        yieldCurveSpread: { enabled: true, weight: 0.5 },
        usdStrength: { enabled: true, weight: 0.4 },
        creditSpread: { enabled: true, weight: 0.6 },
        inflationExpectation: { enabled: true, weight: 0.5 },
        marketBreadth: { enabled: true, weight: 0.45 },
      },
      overlays: {
        transitionalBuyScale: 0.85,
        riskOffBuyScale: 0.7,
        highRiskBuyScale: 0.55,
      },
    },
  },
  cognitiveAgent: {
    enabled: true,
    maxInvestigationTargets: 3,
    reviewIntervalDays: 14,
    memoryRecallLimit: 5,
    circuitBreakerThreshold: 3,
    schedule: "2x_daily",
    scheduleTimesUtc: ["13:00", "21:00"],
    memoryDecayRate: 0.97,
    memoryArchiveThreshold: 0.05,
    agentOverlayEnabled: false,
    agentTriggerEnabled: false,
    thesisStalenessDays: 7,
  },
  watchlistEntry: {
    enabled: false,
    maxPerCycle: 2,
    defaultRules: {
      minTechnicalScore: 65,
      minValuationScore: 60,
      minFusionScore: 62,
      requireStrongMomentum: false,
    },
    notionalCashCapPct: 0.3,
  },
  notification: {
    dailyAnalysisHourUtc: 1,
    telegram: {
      enabled: false,
      onDriftTrigger: false,
      onSuggestionGenerated: false,
      onTradeExecuted: false,
      dailyReport: false,
    },
    feishu: {
      enabled: false,
      onDriftTrigger: false,
      onSuggestionGenerated: false,
      onTradeExecuted: false,
      dailyReport: false,
    },
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function normalizeFundRows(input: unknown): DaaHfFundTrack[] {
  if (!Array.isArray(input)) return [];
  const out = new Map<string, DaaHfFundTrack>();
  for (const row of input) {
    const rec = isRecord(row) ? row : {};
    const fundCode = String(rec.fundCode || "").trim();
    if (!fundCode) continue;
    const kindRaw = String(rec.kind || "equity").trim();
    const kind: DaaFundKind = kindRaw === "qdii" || kindRaw === "balanced" ? kindRaw : "equity";
    out.set(fundCode, {
      fundCode,
      label: String(rec.label || `基金 ${fundCode}`).trim() || `基金 ${fundCode}`,
      kind,
      enabled: toBool(rec.enabled, true),
    });
  }
  return [...out.values()];
}

function normalizeFusionWeights(input: unknown): DaaSystemConfig["dataSources"]["newsFeed"]["fusionWeights"] {
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

  const baseSignalSum = human + news + technical;
  if (!(baseSignalSum > 0)) return defaultWeights;
  return {
    human: (human / baseSignalSum) * 0.85,
    news: (news / baseSignalSum) * 0.85,
    technical: (technical / baseSignalSum) * 0.85,
    valuation: 0.15,
  };
}

const MARKET_INDICATOR_CONFIG_KEYS_: DaaMarketIndicatorConfigKey[] = [
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
  fallback: DaaMarketIndicatorsConfig["indicators"],
): DaaMarketIndicatorsConfig["indicators"] {
  const source = isRecord(input) ? input : {};
  const out = {} as DaaMarketIndicatorsConfig["indicators"];
  let positiveWeightCount = 0;
  for (const key of MARKET_INDICATOR_CONFIG_KEYS_) {
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
  fallback: DaaMarketIndicatorsConfig,
): DaaMarketIndicatorsConfig {
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
    const token = normalizeCurrencyPairToken(item);
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
  fallback: DaaSystemConfig["rebalanceStrategy"]["calendar"]["frequency"],
): DaaSystemConfig["rebalanceStrategy"]["calendar"]["frequency"] {
  const text = String(value || "").trim().toLowerCase();
  if (text === "every_3_days" || text === "every_3days" || text === "3days") return "every_3_days";
  if (text === "weekly") return "weekly";
  if (text === "quarterly") return "quarterly";
  if (text === "semi_annual" || text === "semi-annual" || text === "semiannual") return "semi_annual";
  if (text === "annual" || text === "yearly") return "annual";
  if (text === "monthly") return "monthly";
  return fallback;
}

function normalizeCheckFrequency(
  value: unknown,
  fallback: DaaSystemConfig["rebalanceStrategy"]["drift"]["checkFrequency"],
): DaaSystemConfig["rebalanceStrategy"]["drift"]["checkFrequency"] {
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

function deriveDailyAnalysisHourUtc(analysisTimeUtc: string, fallback: number): number {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(analysisTimeUtc || "").trim());
  if (!matched) return fallback;
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  return minute > 0 ? (hour + 1) % 24 : hour;
}

function normalizeStrategyExecutionTiming(value: unknown, fallback: DaaStrategyExecutionTiming = "t_plus_1_close"): DaaStrategyExecutionTiming {
  const text = String(value || "").trim().toLowerCase();
  if (text === "t_plus_1_close") return "t_plus_1_close";
  return fallback;
}

export function getStrategyExecutionConfig(config: Pick<DaaSystemConfig, "strategy">): DaaStrategyExecutionConfig & {
  maxOrderPctOfNav: number;
} {
  const fallback = DEFAULT_SYSTEM_CONFIG_.strategy;
  const execution = config.strategy.execution || fallback.execution;
  const constraints = config.strategy.constraints || fallback.constraints;
  const feeRateBpsRaw = Number(execution.feeRateBps);
  const fallbackConstraintFeeRateBps = Number(constraints.tradeFeeRateBps);

  return {
    maxOrderPctOfNav: clamp(Number(constraints.maxOrderPctOfNav), 0.01, 1),
    feeRateBps: clamp(
      Number.isFinite(feeRateBpsRaw)
        ? feeRateBpsRaw
        : (Number.isFinite(fallbackConstraintFeeRateBps) ? fallbackConstraintFeeRateBps : fallback.execution.feeRateBps),
      0,
      500,
    ),
    slippageBps: clamp(Number(execution.slippageBps), 0, 500),
    timing: normalizeStrategyExecutionTiming(execution.timing, fallback.execution.timing),
  };
}

export function normalizeSystemConfig(raw: unknown): DaaSystemConfig {
  const fallback = clone(DEFAULT_SYSTEM_CONFIG_);
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
  const notificationTelegram = isRecord(notification.telegram) ? notification.telegram : {};
  const notificationFeishu = isRecord(notification.feishu) ? notification.feishu : {};

  const normalizedAnalysisTimeUtc = normalizeAnalysisTimeUtc(
    rebalanceStrategy.analysisTimeUtc,
    fallback.rebalanceStrategy.analysisTimeUtc,
  );

  const normalized: DaaSystemConfig = {
    strategy: {
      account: {
        baseCurrency: normalizeBaseCurrencyCode(account.baseCurrency, fallback.strategy.account.baseCurrency),
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
        timing: normalizeStrategyExecutionTiming(execution.timing, fallback.strategy.execution.timing),
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
      analysisTimeUtc: normalizedAnalysisTimeUtc,
      timezone: String(rebalanceStrategy.timezone || fallback.rebalanceStrategy.timezone).trim() || fallback.rebalanceStrategy.timezone,
      analysisFocus: String(rebalanceStrategy.analysisFocus || fallback.rebalanceStrategy.analysisFocus).trim() || fallback.rebalanceStrategy.analysisFocus,
      autoGenerateEnabled: toBool(rebalanceStrategy.autoGenerateEnabled, fallback.rebalanceStrategy.autoGenerateEnabled),
      autoExecuteEnabled: toBool(rebalanceStrategy.autoExecuteEnabled, fallback.rebalanceStrategy.autoExecuteEnabled ?? false),
      autoExecuteMaxSinglePct: clamp(Number(rebalanceStrategy.autoExecuteMaxSinglePct) || (fallback.rebalanceStrategy.autoExecuteMaxSinglePct ?? 10), 1, 50),
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
        baseCurrency: normalizeBaseCurrencyCode(fxFeed.baseCurrency, fallback.dataSources.fxFeed.baseCurrency),
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
    cognitiveAgent: (() => {
      const ca = isRecord(source.cognitiveAgent) ? source.cognitiveAgent : {};
      const fb = fallback.cognitiveAgent ?? { enabled: true, maxInvestigationTargets: 3, reviewIntervalDays: 14, memoryRecallLimit: 5, circuitBreakerThreshold: 3, schedule: "2x_daily" as const, scheduleTimesUtc: ["13:00", "21:00"], memoryDecayRate: 0.97, memoryArchiveThreshold: 0.05 };
      const validSchedules = new Set(["2x_daily", "daily", "every_6h", "manual_only"]);
      const rawSchedule = String(ca.schedule ?? "");
      return {
        enabled: toBool(ca.enabled, fb.enabled),
        maxInvestigationTargets: clamp(Math.trunc(Number(ca.maxInvestigationTargets) || fb.maxInvestigationTargets), 1, 10),
        reviewIntervalDays: clamp(Math.trunc(Number(ca.reviewIntervalDays) || fb.reviewIntervalDays), 1, 90),
        memoryRecallLimit: clamp(Math.trunc(Number(ca.memoryRecallLimit) || fb.memoryRecallLimit), 1, 20),
        circuitBreakerThreshold: clamp(Math.trunc(Number(ca.circuitBreakerThreshold) || fb.circuitBreakerThreshold), 1, 10),
        schedule: (validSchedules.has(rawSchedule) ? rawSchedule : fb.schedule) as "2x_daily" | "daily" | "every_6h" | "manual_only",
        scheduleTimesUtc: Array.isArray(ca.scheduleTimesUtc) ? (ca.scheduleTimesUtc as string[]).filter(t => /^\d{1,2}:\d{2}$/.test(String(t))).slice(0, 4) : clone(fb.scheduleTimesUtc),
        memoryDecayRate: clamp(Number(ca.memoryDecayRate) || fb.memoryDecayRate, 0.5, 1.0),
        memoryArchiveThreshold: clamp(Number(ca.memoryArchiveThreshold) || fb.memoryArchiveThreshold, 0.01, 0.5),
        agentOverlayEnabled: toBool(ca.agentOverlayEnabled, false),
        agentTriggerEnabled: toBool(ca.agentTriggerEnabled, false),
        thesisStalenessDays: clamp(Math.trunc(Number(ca.thesisStalenessDays) || 7), 1, 60),
      };
    })(),
    watchlistEntry: (() => {
      const we = isRecord(source.watchlistEntry) ? source.watchlistEntry : {};
      const fb = fallback.watchlistEntry ?? {
        enabled: false,
        maxPerCycle: 2,
        defaultRules: { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false },
        notionalCashCapPct: 0.3,
      };
      const rules = isRecord(we.defaultRules) ? we.defaultRules : {};
      return {
        enabled: toBool(we.enabled, fb.enabled),
        maxPerCycle: clamp(Math.trunc(Number(we.maxPerCycle) || fb.maxPerCycle), 1, 10),
        defaultRules: {
          minTechnicalScore: clamp(Number(rules.minTechnicalScore) || fb.defaultRules.minTechnicalScore, 0, 100),
          minValuationScore: clamp(Number(rules.minValuationScore) || fb.defaultRules.minValuationScore, 0, 100),
          minFusionScore: clamp(Number(rules.minFusionScore) || fb.defaultRules.minFusionScore, 0, 100),
          requireStrongMomentum: toBool(rules.requireStrongMomentum, fb.defaultRules.requireStrongMomentum),
        },
        notionalCashCapPct: clamp(Number(we.notionalCashCapPct) || fb.notionalCashCapPct, 0.05, 1.0),
      };
    })(),
    notification: {
      dailyAnalysisHourUtc: deriveDailyAnalysisHourUtc(
        normalizedAnalysisTimeUtc,
        Math.min(23, Math.max(0, Math.trunc(Number(notification.dailyAnalysisHourUtc) || fallback.notification.dailyAnalysisHourUtc))),
      ),
      telegram: {
        enabled: toBool(notificationTelegram.enabled, fallback.notification.telegram.enabled),
        onDriftTrigger: toBool(notificationTelegram.onDriftTrigger, fallback.notification.telegram.onDriftTrigger),
        onSuggestionGenerated: toBool(notificationTelegram.onSuggestionGenerated, fallback.notification.telegram.onSuggestionGenerated),
        onTradeExecuted: toBool(notificationTelegram.onTradeExecuted, fallback.notification.telegram.onTradeExecuted),
        dailyReport: toBool(notificationTelegram.dailyReport, fallback.notification.telegram.dailyReport),
      },
      feishu: {
        enabled: toBool(notificationFeishu.enabled, fallback.notification.feishu.enabled),
        onDriftTrigger: toBool(notificationFeishu.onDriftTrigger, fallback.notification.feishu.onDriftTrigger),
        onSuggestionGenerated: toBool(notificationFeishu.onSuggestionGenerated, fallback.notification.feishu.onSuggestionGenerated),
        onTradeExecuted: toBool(notificationFeishu.onTradeExecuted, fallback.notification.feishu.onTradeExecuted),
        dailyReport: toBool(notificationFeishu.dailyReport, fallback.notification.feishu.dailyReport),
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

export function applySystemConfigPatches(base: DaaSystemConfig, patches: DaaSystemConfigPatch[]): DaaSystemConfig {
  if (!Array.isArray(patches) || patches.length === 0) return normalizeSystemConfig(base);
  const draft = clone(base) as unknown as Record<string, unknown>;

  for (const patch of patches) {
    const path = toPathSegments(patch.path);
    if (!path.length) continue;
    applyPathValue(draft, path, patch.value);
  }

  return normalizeSystemConfig(draft);
}
