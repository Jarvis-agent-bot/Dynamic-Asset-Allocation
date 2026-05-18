import { clamp } from "@/src/core/math";
import {
  normalizeBaseCurrencyCode,
  normalizeCurrencyPairToken,
  type CurrencyCode,
} from "@/src/daa/config/currency";
import { MARKET_INDICATOR_CONFIG_KEYS_ } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import type { DaaPolicyConfig, PolicyReviewFrequency } from "@/src/daa/modules/policy-engine/policyTypes";

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
  enabled: boolean;
  refreshIntervalMinutes: number;
  indicators: Record<DaaMarketIndicatorConfigKey, DaaMarketIndicatorConfigItem>;
  overlays: {
    transitionalBuyScale: number;
    riskOffBuyScale: number;
    highRiskBuyScale: number;
  };
};

export type DaaBrainMode = "advisor" | "operator" | "autopilot";
export type DaaCognitiveAgentSchedule = "2x_daily" | "daily" | "every_6h" | "manual_only";

const COGNITIVE_AGENT_SCHEDULE_TIMES_: Record<DaaCognitiveAgentSchedule, string[]> = {
  "2x_daily": ["13:00", "21:00"],
  daily: ["21:00"],
  every_6h: ["01:00", "07:00", "13:00", "19:00"],
  manual_only: [],
};

export function deriveCognitiveAgentScheduleTimesUtc(schedule: DaaCognitiveAgentSchedule): string[] {
  return [...(COGNITIVE_AGENT_SCHEDULE_TIMES_[schedule] ?? COGNITIVE_AGENT_SCHEDULE_TIMES_.daily)];
}

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
    };
    execution: DaaStrategyExecutionConfig;
    risk: {
      perAssetStopLossPct: number;
      perAssetTakeProfitPct: number;
      maxConcentrationPct: number;
      correlationCapPct: number;
      enforceOnExecution: boolean;
    };
  };
  /** AI Native 策略引擎配置：signals -> intents -> policy decision -> proposal plan。 */
  policy: DaaPolicyConfig;
  dataSources: {
    hfFund: {
      enabled: boolean;
      funds: DaaHfFundTrack[];
    };
    priceFeed: {
      enabled: boolean;
      symbols: string[];
      marketCache: {
        freshMinutes: number;
        serveStaleHours: number;
        rawRetentionDays: number;
      };
    };
    newsFeed: {
      enabled: boolean;
      query: string;
      symbols: string[];
    };
    fxFeed: {
      enabled: boolean;
      baseCurrency: CurrencyCode;
      pairs: string[];
    };
    /** 多模型配置（支持按任务类型选择不同模型） */
    llmModels: {
      /** 模型唯一标识 */
      id: string;
      /** 模型名称（用于显示） */
      label: string;
      /** 任务类型：analysis=分析解读, decision=决策执行, research=深度研究 */
      taskType: "analysis" | "decision" | "research";
      enabled: boolean;
      provider: string;
      model: string;
      timeoutMs: number;
      /** 自定义 endpoint */
      endpoint?: string;
    }[];
    marketIndicators: DaaMarketIndicatorsConfig;
  };
  /** 大脑控制面：定义 AI 的授权等级；配置写入不属于自动驾驶权限 */
  brain?: {
    mode: DaaBrainMode;
  };
  /** 认知 Agent 配置 */
  cognitiveAgent?: {
    enabled: boolean;
    /** 每次调查最大论点数（默认 5） */
    maxInvestigationTargets: number;
    /** 新论点默认复盘间隔天数（默认 14） */
    reviewIntervalDays: number;
    /** 每次调查召回记忆数（默认 5） */
    memoryRecallLimit: number;
    /** 连续 LLM 失败触发熔断的阈值（默认 3） */
    circuitBreakerThreshold: number;
    /** 运行频率 */
    schedule: DaaCognitiveAgentSchedule;
    /** 记忆衰减率 per day（默认 0.97，约 23 天半衰期） */
    memoryDecayRate: number;
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
    /** AI 自动维护观察列表目标权重池：只在开关开启后允许 Agent 写入 watchlist 目标权重 */
    aiTargetWeightPool: {
      enabled: boolean;
      minConfidence: number;
      /** 写入目标权重时同步打开该资产的 auto-entry，让信号/风控链路继续接管买入 */
      autoEnableEntry: boolean;
    };
    /** 单次建仓金额上限（以可用现金的百分比为上限，0-1） */
    notionalCashCapPct: number;
  };
  notification: {
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

const DEFAULT_POLICY_CONFIG_: DaaPolicyConfig = {
  enabled: true,
  shadowMode: false,
  drift: {
    enabled: true,
    mode: "static_band",
    outerBandPct: 0.05,
    innerBandPct: 0.02,
    minNotionalBase: 200,
    volatilityLookbackDays: 60,
  },
  review: {
    enabled: true,
    frequency: "monthly",
    dayOfMonth: 1,
    scheduledTimeUtc: "00:20",
    timezone: "Asia/Shanghai",
  },
  throttle: {
    proposalDedupeWindowHours: 24,
    autoExecutionCooldownHours: 72,
    allowRiskReductionOverride: true,
    allowSevereRiskOverride: true,
    minScoreToBreakCooldown: 85,
  },
  actionScore: {
    proposalThreshold: 0,
    autoExecuteThreshold: 0,
  },
  execution: {
    autoGenerateEnabled: true,
    autoExecuteEnabled: true,
    maxSingleOrderPctOfNav: 0.1,
  },
};

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
    },
    execution: {
      feeRateBps: 5,
      slippageBps: 0,
      timing: "t_plus_1_close",
    },
    risk: {
      perAssetStopLossPct: 0.2,
      perAssetTakeProfitPct: 0.25,
      maxConcentrationPct: 0.3,
      correlationCapPct: 0.6,
      enforceOnExecution: true,
    },
  },
  policy: clone(DEFAULT_POLICY_CONFIG_),
  dataSources: {
    hfFund: {
      enabled: true,
      funds: DEFAULT_HF_FUNDS_,
    },
    priceFeed: {
      enabled: true,
      symbols: ["SPY", "QQQ", "BND", "TSLA"],
      marketCache: {
        freshMinutes: 15,
        serveStaleHours: 48,
        rawRetentionDays: 90,
      },
    },
    newsFeed: {
      enabled: true,
      query: "SPY OR QQQ OR TSLA",
      symbols: [],
    },
    fxFeed: {
      enabled: true,
      baseCurrency: "USD",
      pairs: ["USD/CNY", "USD/HKD", "USD/USDT"],
    },
    llmModels: [
      {
        id: "llm_model_default",
        label: "默认分析模型",
        taskType: "analysis",
        enabled: true,
        provider: "deepseek",
        model: "deepseek-chat",
        timeoutMs: 15000,
      },
      {
        id: "llm_model_decision",
        label: "默认决策模型",
        taskType: "decision",
        enabled: true,
        provider: "deepseek",
        model: "deepseek-chat",
        timeoutMs: 20000,
      },
      {
        id: "llm_model_reasoner",
        label: "深度推理模型",
        taskType: "research",
        enabled: true,
        provider: "deepseek",
        model: "deepseek-reasoner",
        timeoutMs: 90000,
      },
    ],
    marketIndicators: {
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
  brain: {
    mode: "autopilot",
  },
  cognitiveAgent: {
    enabled: true,
    maxInvestigationTargets: 5,
    reviewIntervalDays: 14,
    memoryRecallLimit: 5,
    circuitBreakerThreshold: 3,
    schedule: "daily",
    memoryDecayRate: 0.97,
    thesisStalenessDays: 7,
  },
  watchlistEntry: {
    enabled: true,
    maxPerCycle: 2,
    defaultRules: {
      minTechnicalScore: 65,
      minValuationScore: 60,
      minFusionScore: 62,
      requireStrongMomentum: false,
    },
    aiTargetWeightPool: {
      enabled: true,
      minConfidence: 0,
      autoEnableEntry: true,
    },
    notionalCashCapPct: 0.3,
  },
  notification: {
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

function normalizeReviewFrequency(
  value: unknown,
  fallback: PolicyReviewFrequency,
): PolicyReviewFrequency {
  const text = String(value || "").trim().toLowerCase();
  if (text === "every_3_days" || text === "every_3days" || text === "3days") return "every_3_days";
  if (text === "weekly") return "weekly";
  if (text === "quarterly") return "quarterly";
  if (text === "semi_annual" || text === "semi-annual" || text === "semiannual") return "semi_annual";
  if (text === "annual" || text === "yearly") return "annual";
  if (text === "monthly") return "monthly";
  return fallback;
}

function normalizeDayOfMonth(value: unknown, fallback: number): number {
  const day = Number(value);
  if (!Number.isFinite(day)) return fallback;
  return Math.max(1, Math.min(28, Math.trunc(day)));
}

function normalizeScheduledTimeUtc(value: unknown, fallback: string): string {
  const text = String(value || "").trim();
  if (!text) return fallback;
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!matched) return fallback;
  return `${matched[1]}:${matched[2]}`;
}

function normalizePolicyReviewFrequency(
  value: unknown,
  fallback: PolicyReviewFrequency,
): PolicyReviewFrequency {
  return normalizeReviewFrequency(value, fallback);
}

function numberWithFallback(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizePolicyConfig(
  input: unknown,
  constraints: DaaSystemConfig["strategy"]["constraints"],
  fallback: DaaPolicyConfig,
): DaaPolicyConfig {
  const source = isRecord(input) ? input : {};
  const drift = isRecord(source.drift) ? source.drift : {};
  const review = isRecord(source.review) ? source.review : {};
  const throttle = isRecord(source.throttle) ? source.throttle : {};
  const actionScore = isRecord(source.actionScore) ? source.actionScore : {};
  const execution = isRecord(source.execution) ? source.execution : {};

  const rawOuterBandPct = numberWithFallback(drift.outerBandPct, fallback.drift.outerBandPct);
  const outerBandPct = clamp(rawOuterBandPct, 0.005, 0.5);
  const rawInnerBandPct = numberWithFallback(drift.innerBandPct, fallback.drift.innerBandPct);
  const innerBandPct = clamp(rawInnerBandPct, 0.001, Math.max(0.001, outerBandPct - 0.001));

  return {
    enabled: toBool(source.enabled, fallback.enabled),
    shadowMode: toBool(source.shadowMode, fallback.shadowMode),
    drift: {
      enabled: toBool(drift.enabled, fallback.drift.enabled),
      mode: String(drift.mode || fallback.drift.mode).trim() === "volatility_adjusted"
        ? "volatility_adjusted"
        : "static_band",
      outerBandPct,
      innerBandPct,
      minNotionalBase: Math.max(
        0,
        numberWithFallback(drift.minNotionalBase, constraints.minNotional || fallback.drift.minNotionalBase),
      ),
      volatilityLookbackDays: clamp(
        Math.trunc(numberWithFallback(drift.volatilityLookbackDays, fallback.drift.volatilityLookbackDays)),
        5,
        365,
      ),
    },
    review: {
      enabled: toBool(review.enabled, fallback.review.enabled),
      frequency: normalizePolicyReviewFrequency(review.frequency, fallback.review.frequency),
      dayOfMonth: normalizeDayOfMonth(review.dayOfMonth, fallback.review.dayOfMonth),
      scheduledTimeUtc: normalizeScheduledTimeUtc(review.scheduledTimeUtc, fallback.review.scheduledTimeUtc),
      timezone: String(review.timezone || fallback.review.timezone).trim() || fallback.review.timezone,
    },
    throttle: {
      proposalDedupeWindowHours: clamp(
        Math.trunc(numberWithFallback(throttle.proposalDedupeWindowHours, fallback.throttle.proposalDedupeWindowHours)),
        1,
        24 * 30,
      ),
      autoExecutionCooldownHours: clamp(
        Math.trunc(numberWithFallback(throttle.autoExecutionCooldownHours, fallback.throttle.autoExecutionCooldownHours)),
        1,
        24 * 30,
      ),
      allowRiskReductionOverride: toBool(throttle.allowRiskReductionOverride, fallback.throttle.allowRiskReductionOverride),
      allowSevereRiskOverride: toBool(throttle.allowSevereRiskOverride, fallback.throttle.allowSevereRiskOverride),
      minScoreToBreakCooldown: clamp(
        numberWithFallback(throttle.minScoreToBreakCooldown, fallback.throttle.minScoreToBreakCooldown),
        0,
        100,
      ),
    },
    actionScore: {
      proposalThreshold: clamp(
        numberWithFallback(actionScore.proposalThreshold, fallback.actionScore.proposalThreshold),
        0,
        100,
      ),
      autoExecuteThreshold: clamp(
        numberWithFallback(actionScore.autoExecuteThreshold, fallback.actionScore.autoExecuteThreshold),
        0,
        100,
      ),
    },
    execution: {
      autoGenerateEnabled: toBool(execution.autoGenerateEnabled, fallback.execution.autoGenerateEnabled),
      autoExecuteEnabled: toBool(execution.autoExecuteEnabled, fallback.execution.autoExecuteEnabled),
      maxSingleOrderPctOfNav: clamp(
        numberWithFallback(execution.maxSingleOrderPctOfNav, fallback.execution.maxSingleOrderPctOfNav),
        0.01,
        0.5,
      ),
    },
  };
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

  return {
    maxOrderPctOfNav: clamp(Number(constraints.maxOrderPctOfNav), 0.01, 1),
    feeRateBps: clamp(
      Number.isFinite(feeRateBpsRaw) ? feeRateBpsRaw : fallback.execution.feeRateBps,
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
  const risk = isRecord(strategy.risk) ? strategy.risk : {};

  const dataSources = isRecord(source.dataSources) ? source.dataSources : {};
  const hfFund = isRecord(dataSources.hfFund) ? dataSources.hfFund : {};
  const priceFeed = isRecord(dataSources.priceFeed) ? dataSources.priceFeed : {};
  const priceFeedMarketCache = isRecord(priceFeed.marketCache) ? priceFeed.marketCache : {};
  const newsFeed = isRecord(dataSources.newsFeed) ? dataSources.newsFeed : {};
  const fxFeed = isRecord(dataSources.fxFeed) ? dataSources.fxFeed : {};
  const llmModels = Array.isArray(dataSources.llmModels) ? dataSources.llmModels : [];
  const marketIndicators = isRecord(dataSources.marketIndicators) ? dataSources.marketIndicators : {};

  const notification = isRecord(source.notification) ? source.notification : {};
  const notificationTelegram = isRecord(notification.telegram) ? notification.telegram : {};
  const notificationFeishu = isRecord(notification.feishu) ? notification.feishu : {};

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
      },
      execution: {
        feeRateBps: clamp(
          Number.isFinite(Number(execution.feeRateBps)) ? Number(execution.feeRateBps) : fallback.strategy.execution.feeRateBps,
          0,
          500,
        ),
        slippageBps: clamp(Number(execution.slippageBps) || fallback.strategy.execution.slippageBps, 0, 500),
        timing: normalizeStrategyExecutionTiming(execution.timing, fallback.strategy.execution.timing),
      },
      risk: {
        perAssetStopLossPct: clamp(Number(risk.perAssetStopLossPct) || fallback.strategy.risk.perAssetStopLossPct, 0.05, 0.5),
        perAssetTakeProfitPct: clamp(
          Number(risk.perAssetTakeProfitPct) || fallback.strategy.risk.perAssetTakeProfitPct,
          0.05,
          1.5,
        ),
        maxConcentrationPct: clamp(Number(risk.maxConcentrationPct) || fallback.strategy.risk.maxConcentrationPct, 0.1, 1),
        correlationCapPct: clamp(Number(risk.correlationCapPct) || fallback.strategy.risk.correlationCapPct, 0.1, 1),
        enforceOnExecution: toBool(risk.enforceOnExecution, fallback.strategy.risk.enforceOnExecution),
      },
    },
    policy: normalizePolicyConfig(source.policy, {
      maxPositionPct: clamp(Number(constraints.maxPositionPct) || fallback.strategy.constraints.maxPositionPct, 0.01, 1),
      minNotional: toPositiveNumber(constraints.minNotional, fallback.strategy.constraints.minNotional),
      maxOrderPctOfNav: clamp(Number(constraints.maxOrderPctOfNav) || fallback.strategy.constraints.maxOrderPctOfNav, 0.01, 1),
    }, fallback.policy),
    dataSources: {
      hfFund: {
        enabled: toBool(hfFund.enabled, fallback.dataSources.hfFund.enabled),
        funds: normalizeFundRows(hfFund.funds).length ? normalizeFundRows(hfFund.funds) : clone(fallback.dataSources.hfFund.funds),
      },
      priceFeed: {
        enabled: toBool(priceFeed.enabled, fallback.dataSources.priceFeed.enabled),
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
        enabled: toBool(newsFeed.enabled, fallback.dataSources.newsFeed.enabled),
        query: String(newsFeed.query || fallback.dataSources.newsFeed.query).trim(),
        symbols: normalizeSymbols(newsFeed.symbols),
      },
      fxFeed: {
        enabled: toBool(fxFeed.enabled, fallback.dataSources.fxFeed.enabled),
        baseCurrency: normalizeBaseCurrencyCode(fxFeed.baseCurrency, fallback.dataSources.fxFeed.baseCurrency),
        pairs: normalizePairs(fxFeed.pairs).length ? normalizePairs(fxFeed.pairs) : clone(fallback.dataSources.fxFeed.pairs),
      },
      llmModels: (() => {
        const rawModels = llmModels.length > 0 ? llmModels : clone(fallback.dataSources.llmModels);
        return rawModels.map((m: Record<string, unknown>) => ({
          id: String(m.id || "").trim() || "llm_model_default",
          label: String(m.label || m.id || "模型").trim(),
          taskType: (["analysis", "decision", "research"].includes(String(m.taskType)) ? m.taskType : "analysis") as "analysis" | "decision" | "research",
          enabled: toBool(m.enabled, true),
          provider: String(m.provider || "deepseek").trim(),
          model: String(m.model || "deepseek-chat").trim(),
          timeoutMs: Math.max(2000, Math.trunc(Number(m.timeoutMs) || 15000)),
          endpoint: m.endpoint ? String(m.endpoint).trim() : undefined,
        }));
      })(),
      marketIndicators: normalizeMarketIndicatorConfig(marketIndicators, fallback.dataSources.marketIndicators),
    },
    brain: (() => {
      const brain = isRecord(source.brain) ? source.brain : {};
      const fb = fallback.brain ?? {
        mode: "autopilot" as DaaBrainMode,
      };
      const rawMode = String(brain.mode ?? "");
      const validModes = new Set(["advisor", "operator", "autopilot"]);
      const mode = (validModes.has(rawMode) ? rawMode : fb.mode) as DaaBrainMode;

      return {
        mode,
      };
    })(),
    cognitiveAgent: (() => {
      const ca = isRecord(source.cognitiveAgent) ? source.cognitiveAgent : {};
      const fb = fallback.cognitiveAgent ?? {
        enabled: true,
        maxInvestigationTargets: 5,
        reviewIntervalDays: 14,
        memoryRecallLimit: 5,
        circuitBreakerThreshold: 3,
        schedule: "daily" as const,
        memoryDecayRate: 0.97,
        thesisStalenessDays: 7,
      };
      const validSchedules = new Set<DaaCognitiveAgentSchedule>(["2x_daily", "daily", "every_6h", "manual_only"]);
      const rawSchedule = String(ca.schedule ?? "");
      const schedule = (validSchedules.has(rawSchedule as DaaCognitiveAgentSchedule)
        ? rawSchedule
        : fb.schedule) as DaaCognitiveAgentSchedule;
      return {
        enabled: toBool(ca.enabled, fb.enabled),
        maxInvestigationTargets: clamp(Math.trunc(Number(ca.maxInvestigationTargets) || fb.maxInvestigationTargets), 1, 10),
        reviewIntervalDays: clamp(Math.trunc(Number(ca.reviewIntervalDays) || fb.reviewIntervalDays), 1, 90),
        memoryRecallLimit: clamp(Math.trunc(Number(ca.memoryRecallLimit) || fb.memoryRecallLimit), 1, 20),
        circuitBreakerThreshold: clamp(Math.trunc(Number(ca.circuitBreakerThreshold) || fb.circuitBreakerThreshold), 1, 10),
        schedule,
        memoryDecayRate: clamp(Number(ca.memoryDecayRate) || fb.memoryDecayRate, 0.5, 1.0),
        thesisStalenessDays: clamp(Math.trunc(Number(ca.thesisStalenessDays) || fb.thesisStalenessDays || 7), 1, 60),
      };
    })(),
    watchlistEntry: (() => {
      const we = isRecord(source.watchlistEntry) ? source.watchlistEntry : {};
      const fb = fallback.watchlistEntry ?? {
        enabled: true,
        maxPerCycle: 2,
        defaultRules: { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false },
        aiTargetWeightPool: { enabled: true, minConfidence: 0, autoEnableEntry: true },
        notionalCashCapPct: 0.3,
      };
      const rules = isRecord(we.defaultRules) ? we.defaultRules : {};
      const aiTargetWeightPool = isRecord(we.aiTargetWeightPool) ? we.aiTargetWeightPool : {};
      return {
        enabled: toBool(we.enabled, fb.enabled),
        maxPerCycle: clamp(Math.trunc(Number(we.maxPerCycle) || fb.maxPerCycle), 1, 10),
        defaultRules: {
          minTechnicalScore: clamp(Number(rules.minTechnicalScore) || fb.defaultRules.minTechnicalScore, 0, 100),
          minValuationScore: clamp(Number(rules.minValuationScore) || fb.defaultRules.minValuationScore, 0, 100),
          minFusionScore: clamp(Number(rules.minFusionScore) || fb.defaultRules.minFusionScore, 0, 100),
          requireStrongMomentum: toBool(rules.requireStrongMomentum, fb.defaultRules.requireStrongMomentum),
        },
        aiTargetWeightPool: {
          enabled: toBool(aiTargetWeightPool.enabled, fb.aiTargetWeightPool.enabled),
          minConfidence: clamp(Number(aiTargetWeightPool.minConfidence) || fb.aiTargetWeightPool.minConfidence, 0, 100),
          autoEnableEntry: toBool(aiTargetWeightPool.autoEnableEntry, fb.aiTargetWeightPool.autoEnableEntry),
        },
        notionalCashCapPct: clamp(Number(we.notionalCashCapPct) || fb.notionalCashCapPct, 0.05, 1.0),
      };
    })(),
    notification: {
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
  return cleaned.split(/[/.]/).map((item) => item.trim()).filter(Boolean);
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
