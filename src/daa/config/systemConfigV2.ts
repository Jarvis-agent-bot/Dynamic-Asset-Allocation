import {
  normalizeBaseCurrencyCodeV2,
  normalizeCurrencyAliasV2,
  normalizeCurrencyPairTokenV2,
  type CurrencyCodeV2,
} from "@/src/daa/config/currencyV2";

export type DaaFundKindV2 = "equity" | "qdii" | "balanced";

export type DaaHfFundTrackV2 = {
  fundCode: string;
  label: string;
  kind: DaaFundKindV2;
  enabled: boolean;
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
    };
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
      maxConcentrationPct: number;
      correlationCapPct: number;
      maxTotalRiskExposurePct: number;
    };
    targetWeights: Record<string, number>;
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
    };
    newsFeed: {
      id: string;
      enabled: boolean;
      provider: string;
      query: string;
      symbols: string[];
      fusionWeights: {
        human: number;
        news: number;
        technical: number;
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
  };
  notification: {
    enabled: boolean;
    notifyOnDrift: boolean;
    notifyOnRebalance: boolean;
    notifyOnPriceAlert: boolean;
  };
  backtest: {
    benchmarkSymbol: string;
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
      maxPositionPct: 1,
      minNotional: 200,
      maxOrderPctOfNav: 0.1,
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
      maxConcentrationPct: 0.3,
      correlationCapPct: 0.6,
      maxTotalRiskExposurePct: 0.7,
    },
    targetWeights: {},
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
    },
    newsFeed: {
      id: "news_feed.default",
      enabled: true,
      provider: "yahoo_rss",
      query: "SPY OR QQQ OR TSLA",
      symbols: [],
      fusionWeights: {
        human: 0.45,
        news: 0.25,
        technical: 0.3,
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
  },
  notification: {
    enabled: false,
    notifyOnDrift: true,
    notifyOnRebalance: true,
    notifyOnPriceAlert: false,
  },
  backtest: {
    benchmarkSymbol: "SPY",
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
    const fundCode = String((row as any)?.fundCode || "").trim();
    if (!fundCode) continue;
    const kindRaw = String((row as any)?.kind || "equity").trim();
    const kind: DaaFundKindV2 = kindRaw === "qdii" || kindRaw === "balanced" ? kindRaw : "equity";
    out.set(fundCode, {
      fundCode,
      label: String((row as any)?.label || `基金 ${fundCode}`).trim() || `基金 ${fundCode}`,
      kind,
      enabled: toBool((row as any)?.enabled, true),
    });
  }
  return [...out.values()];
}

function normalizeFusionWeights(input: unknown): DaaSystemConfigV2["dataSources"]["newsFeed"]["fusionWeights"] {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    human: Math.max(0, Number(source.human ?? 0.45) || 0.45),
    news: Math.max(0, Number(source.news ?? 0.25) || 0.25),
    technical: Math.max(0, Number(source.technical ?? 0.3) || 0.3),
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
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
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

export function normalizeSystemConfigV2(raw: unknown): DaaSystemConfigV2 {
  const fallback = clone(DEFAULT_SYSTEM_CONFIG_V2);
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};

  const strategy = source.strategy && typeof source.strategy === "object" && !Array.isArray(source.strategy)
    ? source.strategy as Record<string, unknown>
    : {};
  const account = strategy.account && typeof strategy.account === "object" && !Array.isArray(strategy.account)
    ? strategy.account as Record<string, unknown>
    : {};
  const constraints = strategy.constraints && typeof strategy.constraints === "object" && !Array.isArray(strategy.constraints)
    ? strategy.constraints as Record<string, unknown>
    : {};
  const policy = strategy.policy && typeof strategy.policy === "object" && !Array.isArray(strategy.policy)
    ? strategy.policy as Record<string, unknown>
    : {};
  const risk = strategy.risk && typeof strategy.risk === "object" && !Array.isArray(strategy.risk)
    ? strategy.risk as Record<string, unknown>
    : {};

  const dataSources = source.dataSources && typeof source.dataSources === "object" && !Array.isArray(source.dataSources)
    ? source.dataSources as Record<string, unknown>
    : {};
  const hfFund = dataSources.hfFund && typeof dataSources.hfFund === "object" && !Array.isArray(dataSources.hfFund)
    ? dataSources.hfFund as Record<string, unknown>
    : {};
  const priceFeed = dataSources.priceFeed && typeof dataSources.priceFeed === "object" && !Array.isArray(dataSources.priceFeed)
    ? dataSources.priceFeed as Record<string, unknown>
    : {};
  const newsFeed = dataSources.newsFeed && typeof dataSources.newsFeed === "object" && !Array.isArray(dataSources.newsFeed)
    ? dataSources.newsFeed as Record<string, unknown>
    : {};
  const fxFeed = dataSources.fxFeed && typeof dataSources.fxFeed === "object" && !Array.isArray(dataSources.fxFeed)
    ? dataSources.fxFeed as Record<string, unknown>
    : {};
  const llmAnalysis = dataSources.llmAnalysis && typeof dataSources.llmAnalysis === "object" && !Array.isArray(dataSources.llmAnalysis)
    ? dataSources.llmAnalysis as Record<string, unknown>
    : {};

  const notification = source.notification && typeof source.notification === "object" && !Array.isArray(source.notification)
    ? source.notification as Record<string, unknown>
    : {};
  const backtest = source.backtest && typeof source.backtest === "object" && !Array.isArray(source.backtest)
    ? source.backtest as Record<string, unknown>
    : {};

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
        maxConcentrationPct: clamp(Number(risk.maxConcentrationPct) || fallback.strategy.risk.maxConcentrationPct, 0.1, 1),
        correlationCapPct: clamp(Number(risk.correlationCapPct) || fallback.strategy.risk.correlationCapPct, 0.1, 1),
        maxTotalRiskExposurePct: clamp(Number(risk.maxTotalRiskExposurePct) || fallback.strategy.risk.maxTotalRiskExposurePct, 0.1, 1),
      },
      targetWeights: normalizeTargetWeights(strategy.targetWeights),
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
      },
      newsFeed: {
        id: String(newsFeed.id || fallback.dataSources.newsFeed.id).trim() || fallback.dataSources.newsFeed.id,
        enabled: toBool(newsFeed.enabled, fallback.dataSources.newsFeed.enabled),
        provider: String(newsFeed.provider || fallback.dataSources.newsFeed.provider).trim() || fallback.dataSources.newsFeed.provider,
        query: String(newsFeed.query || fallback.dataSources.newsFeed.query).trim(),
        symbols: normalizeSymbols(newsFeed.symbols),
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
    },
    notification: {
      enabled: toBool(notification.enabled, fallback.notification.enabled),
      notifyOnDrift: toBool(notification.notifyOnDrift, fallback.notification.notifyOnDrift),
      notifyOnRebalance: toBool(notification.notifyOnRebalance, fallback.notification.notifyOnRebalance),
      notifyOnPriceAlert: toBool(notification.notifyOnPriceAlert, fallback.notification.notifyOnPriceAlert),
    },
    backtest: {
      benchmarkSymbol: String(backtest.benchmarkSymbol || fallback.backtest.benchmarkSymbol).trim().toUpperCase() || fallback.backtest.benchmarkSymbol,
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
