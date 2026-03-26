import type { DaaMarketIndicatorConfigKey, DaaMarketIndicatorsConfig } from "@/src/daa/config/systemConfig";
import type {
  DaaMarketIndicatorCategory,
  DaaMarketIndicatorKey,
  DaaMarketIndicatorScope,
} from "@/src/daa/modules/marketContext/marketContextTypes";

export const MARKET_SCOPE_LABEL_ZH_: Record<DaaMarketIndicatorScope, string> = {
  us_equity: "美股",
  hk_cn_equity: "港股 / 中概",
  crypto: "加密市场",
  macro_defensive: "宏观防御",
  macro_global: "宏观全局",
};

export const MARKET_INDICATOR_KEYS_: DaaMarketIndicatorKey[] = [
  "vix",
  "qqq_spy_ratio",
  "fxi_volatility",
  "kweb_fxi_ratio",
  "btc_eth_ratio",
  "btc_volatility",
  "gold_silver_ratio",
  "yield_curve_spread",
  "usd_strength",
  "credit_spread",
  "inflation_expectation",
  "market_breadth",
];

export const MARKET_INDICATOR_KEY_BY_CONFIG_KEY_: Record<DaaMarketIndicatorConfigKey, DaaMarketIndicatorKey> = {
  vix: "vix",
  qqqSpyRatio: "qqq_spy_ratio",
  fxiVolatility: "fxi_volatility",
  kwebFxiRatio: "kweb_fxi_ratio",
  btcEthRatio: "btc_eth_ratio",
  btcVolatility: "btc_volatility",
  goldSilverRatio: "gold_silver_ratio",
  yieldCurveSpread: "yield_curve_spread",
  usdStrength: "usd_strength",
  creditSpread: "credit_spread",
  inflationExpectation: "inflation_expectation",
  marketBreadth: "market_breadth",
};

export const MARKET_INDICATOR_CONFIG_KEY_BY_KEY_: Record<DaaMarketIndicatorKey, DaaMarketIndicatorConfigKey> = {
  vix: "vix",
  qqq_spy_ratio: "qqqSpyRatio",
  fxi_volatility: "fxiVolatility",
  kweb_fxi_ratio: "kwebFxiRatio",
  btc_eth_ratio: "btcEthRatio",
  btc_volatility: "btcVolatility",
  gold_silver_ratio: "goldSilverRatio",
  yield_curve_spread: "yieldCurveSpread",
  usd_strength: "usdStrength",
  credit_spread: "creditSpread",
  inflation_expectation: "inflationExpectation",
  market_breadth: "marketBreadth",
};

export const MARKET_INDICATOR_META_CATALOG_: Record<DaaMarketIndicatorKey, {
  label: string;
  category: DaaMarketIndicatorCategory;
  scope: DaaMarketIndicatorScope;
  unit?: string;
  source: string;
  fixedSymbols: string[];
}> = {
  vix: {
    label: "美股恐慌指数 (VIX)",
    category: "volatility",
    scope: "us_equity",
    source: "yfinance:^VIX",
    fixedSymbols: ["^VIX"],
  },
  qqq_spy_ratio: {
    label: "美股成长/大盘比 (QQQ/SPY)",
    category: "relative_value",
    scope: "us_equity",
    unit: "x",
    source: "yfinance:QQQ/SPY",
    fixedSymbols: ["QQQ", "SPY"],
  },
  fxi_volatility: {
    label: "港中概波动率 (FXI)",
    category: "volatility",
    scope: "hk_cn_equity",
    unit: "%",
    source: "yfinance:FXI",
    fixedSymbols: ["FXI"],
  },
  kweb_fxi_ratio: {
    label: "中概互联/大盘比 (KWEB/FXI)",
    category: "relative_value",
    scope: "hk_cn_equity",
    unit: "x",
    source: "yfinance:KWEB/FXI",
    fixedSymbols: ["KWEB", "FXI"],
  },
  btc_eth_ratio: {
    label: "比特币/以太坊比 (BTC/ETH)",
    category: "relative_value",
    scope: "crypto",
    unit: "x",
    source: "yfinance:BTC-USD/ETH-USD",
    fixedSymbols: ["BTC-USD", "ETH-USD"],
  },
  btc_volatility: {
    label: "比特币波动率 (BTC)",
    category: "volatility",
    scope: "crypto",
    unit: "%",
    source: "yfinance:BTC-USD",
    fixedSymbols: ["BTC-USD"],
  },
  gold_silver_ratio: {
    label: "金银比 (GC/SI)",
    category: "relative_value",
    scope: "macro_defensive",
    unit: "x",
    source: "yfinance:GC=F/SI=F",
    fixedSymbols: ["GC=F", "SI=F"],
  },
  yield_curve_spread: {
    label: "收益率曲线斜率 (IEF/SHY)",
    category: "macro",
    scope: "macro_defensive",
    unit: "x",
    source: "yfinance:IEF/SHY",
    fixedSymbols: ["IEF", "SHY"],
  },
  usd_strength: {
    label: "美元强弱波动 (UUP)",
    category: "macro",
    scope: "macro_global",
    unit: "%",
    source: "yfinance:UUP",
    fixedSymbols: ["UUP"],
  },
  credit_spread: {
    label: "信用利差 (HYG/LQD)",
    category: "macro",
    scope: "macro_defensive",
    unit: "x",
    source: "yfinance:HYG/LQD",
    fixedSymbols: ["HYG", "LQD"],
  },
  inflation_expectation: {
    label: "通胀预期 (TIP/IEF)",
    category: "macro",
    scope: "macro_global",
    unit: "x",
    source: "yfinance:TIP/IEF",
    fixedSymbols: ["TIP", "IEF"],
  },
  market_breadth: {
    label: "市场广度 (RSP/SPY)",
    category: "macro",
    scope: "us_equity",
    unit: "x",
    source: "yfinance:RSP/SPY",
    fixedSymbols: ["RSP", "SPY"],
  },
};

export const MARKET_SCOPE_KEY_ORDER_: DaaMarketIndicatorScope[] = [
  "us_equity",
  "hk_cn_equity",
  "crypto",
  "macro_defensive",
  "macro_global",
];

export const MARKET_INDICATOR_KEYS_BY_SCOPE_: Record<DaaMarketIndicatorScope, DaaMarketIndicatorKey[]> = {
  us_equity: ["vix", "qqq_spy_ratio", "market_breadth"],
  hk_cn_equity: ["fxi_volatility", "kweb_fxi_ratio"],
  crypto: ["btc_eth_ratio", "btc_volatility"],
  macro_defensive: ["gold_silver_ratio", "yield_curve_spread", "credit_spread"],
  macro_global: ["usd_strength", "inflation_expectation"],
};

export function getMarketIndicatorRefreshSymbols(config: DaaMarketIndicatorsConfig): string[] {
  const out = new Set<string>();
  for (const key of MARKET_INDICATOR_KEYS_) {
    const configKey = MARKET_INDICATOR_CONFIG_KEY_BY_KEY_[key];
    if (!config.indicators[configKey]?.enabled) continue;
    for (const symbol of MARKET_INDICATOR_META_CATALOG_[key].fixedSymbols) {
      out.add(symbol);
    }
  }
  return [...out];
}

function includesAny(texts: string[], patterns: string[]): boolean {
  const normalizedTexts = texts.map((text) => String(text || "").trim().toLowerCase()).filter(Boolean);
  const normalizedPatterns = patterns.map((pattern) => String(pattern || "").trim().toLowerCase()).filter(Boolean);
  return normalizedPatterns.some((pattern) => normalizedTexts.some((text) => text.includes(pattern)));
}

export function resolveMarketScopeForAsset(input: {
  symbol: string;
  market?: string;
  assetClass?: string;
  marketGroup?: string;
  instrumentType?: string;
  region?: string;
  exchange?: string;
  holdingTags?: string[];
  watchTags?: string[];
}): DaaMarketIndicatorScope {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const tokens = [
    String(input.market || "").trim().toUpperCase(),
    String(input.assetClass || "").trim().toUpperCase(),
    String(input.marketGroup || "").trim().toUpperCase(),
    String(input.instrumentType || "").trim().toUpperCase(),
    String(input.region || "").trim().toUpperCase(),
    String(input.exchange || "").trim().toUpperCase(),
    ...((input.holdingTags || []).map((item) => String(item || "").trim().toLowerCase())),
    ...((input.watchTags || []).map((item) => String(item || "").trim().toLowerCase())),
    symbol.toLowerCase(),
  ].filter(Boolean);

  if (includesAny(tokens, ["crypto", "btc", "eth", "sol", "doge", "-usd"])) {
    return "crypto";
  }

  if (includesAny(tokens, ["gold", "silver", "commodity", "precious", "gc=f", "si=f", "xau", "xag"])) {
    return "macro_defensive";
  }

  if (includesAny(tokens, ["hk", "cn", "china", "ashare", "hkex", "sse", "szse", ".hk", ".ss", ".sz", "kweb", "fxi", "mchi", "cqqq"])) {
    return "hk_cn_equity";
  }

  return "us_equity";
}

export function getRelevantMarketIndicatorKeysForAsset(input: {
  symbol: string;
  market?: string;
  assetClass?: string;
  marketGroup?: string;
  instrumentType?: string;
  region?: string;
  exchange?: string;
  holdingTags?: string[];
  watchTags?: string[];
}): DaaMarketIndicatorKey[] {
  const scope = resolveMarketScopeForAsset(input);
  return MARKET_INDICATOR_KEYS_BY_SCOPE_[scope];
}
