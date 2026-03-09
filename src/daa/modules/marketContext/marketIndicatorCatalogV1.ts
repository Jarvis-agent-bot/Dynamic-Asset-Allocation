import type { DaaMarketIndicatorConfigKeyV2, DaaMarketIndicatorsConfigV2 } from "@/src/daa/config/systemConfigV2";
import type {
  DaaMarketIndicatorCategoryV1,
  DaaMarketIndicatorKeyV1,
  DaaMarketIndicatorScopeV1,
} from "@/src/daa/modules/marketContext/marketContextTypesV1";

export const MARKET_SCOPE_LABEL_ZH_V1: Record<DaaMarketIndicatorScopeV1, string> = {
  us_equity: "美股",
  hk_cn_equity: "港股 / 中概",
  crypto: "加密市场",
  macro_defensive: "宏观防御",
};

export const MARKET_INDICATOR_KEYS_V1: DaaMarketIndicatorKeyV1[] = [
  "vix",
  "qqq_spy_ratio",
  "fxi_volatility",
  "kweb_fxi_ratio",
  "btc_eth_ratio",
  "btc_volatility",
  "gold_silver_ratio",
];

export const MARKET_INDICATOR_KEY_BY_CONFIG_KEY_V1: Record<DaaMarketIndicatorConfigKeyV2, DaaMarketIndicatorKeyV1> = {
  vix: "vix",
  qqqSpyRatio: "qqq_spy_ratio",
  fxiVolatility: "fxi_volatility",
  kwebFxiRatio: "kweb_fxi_ratio",
  btcEthRatio: "btc_eth_ratio",
  btcVolatility: "btc_volatility",
  goldSilverRatio: "gold_silver_ratio",
};

export const MARKET_INDICATOR_CONFIG_KEY_BY_KEY_V1: Record<DaaMarketIndicatorKeyV1, DaaMarketIndicatorConfigKeyV2> = {
  vix: "vix",
  qqq_spy_ratio: "qqqSpyRatio",
  fxi_volatility: "fxiVolatility",
  kweb_fxi_ratio: "kwebFxiRatio",
  btc_eth_ratio: "btcEthRatio",
  btc_volatility: "btcVolatility",
  gold_silver_ratio: "goldSilverRatio",
};

export const MARKET_INDICATOR_META_CATALOG_V1: Record<DaaMarketIndicatorKeyV1, {
  label: string;
  category: DaaMarketIndicatorCategoryV1;
  scope: DaaMarketIndicatorScopeV1;
  unit?: string;
  source: string;
  fixedSymbols: string[];
}> = {
  vix: {
    label: "VIX",
    category: "volatility",
    scope: "us_equity",
    source: "yfinance:^VIX",
    fixedSymbols: ["^VIX"],
  },
  qqq_spy_ratio: {
    label: "QQQ/SPY",
    category: "relative_value",
    scope: "us_equity",
    unit: "x",
    source: "yfinance:QQQ/SPY",
    fixedSymbols: ["QQQ", "SPY"],
  },
  fxi_volatility: {
    label: "FXI 波动率",
    category: "volatility",
    scope: "hk_cn_equity",
    unit: "%",
    source: "yfinance:FXI",
    fixedSymbols: ["FXI"],
  },
  kweb_fxi_ratio: {
    label: "KWEB/FXI",
    category: "relative_value",
    scope: "hk_cn_equity",
    unit: "x",
    source: "yfinance:KWEB/FXI",
    fixedSymbols: ["KWEB", "FXI"],
  },
  btc_eth_ratio: {
    label: "BTC/ETH",
    category: "relative_value",
    scope: "crypto",
    unit: "x",
    source: "yfinance:BTC-USD/ETH-USD",
    fixedSymbols: ["BTC-USD", "ETH-USD"],
  },
  btc_volatility: {
    label: "BTC 波动率",
    category: "volatility",
    scope: "crypto",
    unit: "%",
    source: "yfinance:BTC-USD",
    fixedSymbols: ["BTC-USD"],
  },
  gold_silver_ratio: {
    label: "金银比",
    category: "relative_value",
    scope: "macro_defensive",
    unit: "x",
    source: "yfinance:GC=F/SI=F",
    fixedSymbols: ["GC=F", "SI=F"],
  },
};

export const MARKET_SCOPE_KEY_ORDER_V1: DaaMarketIndicatorScopeV1[] = [
  "us_equity",
  "hk_cn_equity",
  "crypto",
  "macro_defensive",
];

export const MARKET_INDICATOR_KEYS_BY_SCOPE_V1: Record<DaaMarketIndicatorScopeV1, DaaMarketIndicatorKeyV1[]> = {
  us_equity: ["vix", "qqq_spy_ratio"],
  hk_cn_equity: ["fxi_volatility", "kweb_fxi_ratio"],
  crypto: ["btc_eth_ratio", "btc_volatility"],
  macro_defensive: ["gold_silver_ratio"],
};

export function getMarketIndicatorRefreshSymbolsV1(config: DaaMarketIndicatorsConfigV2): string[] {
  const out = new Set<string>();
  for (const key of MARKET_INDICATOR_KEYS_V1) {
    const configKey = MARKET_INDICATOR_CONFIG_KEY_BY_KEY_V1[key];
    if (!config.indicators[configKey]?.enabled) continue;
    for (const symbol of MARKET_INDICATOR_META_CATALOG_V1[key].fixedSymbols) {
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

export function resolveMarketScopeForAssetV1(input: {
  symbol: string;
  market?: string;
  assetClass?: string;
  marketGroup?: string;
  instrumentType?: string;
  region?: string;
  exchange?: string;
  holdingTags?: string[];
  watchTags?: string[];
}): DaaMarketIndicatorScopeV1 {
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

export function getRelevantMarketIndicatorKeysForAssetV1(input: {
  symbol: string;
  market?: string;
  assetClass?: string;
  marketGroup?: string;
  instrumentType?: string;
  region?: string;
  exchange?: string;
  holdingTags?: string[];
  watchTags?: string[];
}): DaaMarketIndicatorKeyV1[] {
  const scope = resolveMarketScopeForAssetV1(input);
  return MARKET_INDICATOR_KEYS_BY_SCOPE_V1[scope];
}
