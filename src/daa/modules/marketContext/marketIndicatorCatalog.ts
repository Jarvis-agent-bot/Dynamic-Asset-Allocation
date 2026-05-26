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
  macro_policy: "宏观政策",
};

export type DaaMarketIndicatorMeaning = {
  measurement: string;
  highSignal: string;
  lowSignal: string;
  neutralSignal: string;
  usage: string;
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
  "ppi_inflation",
  "fed_policy_rate",
  "fed_balance_sheet",
];

export const MARKET_INDICATOR_CONFIG_KEYS_: DaaMarketIndicatorConfigKey[] = [
  "vix",
  "qqqSpyRatio",
  "fxiVolatility",
  "kwebFxiRatio",
  "btcEthRatio",
  "btcVolatility",
  "goldSilverRatio",
  "yieldCurveSpread",
  "usdStrength",
  "creditSpread",
  "inflationExpectation",
  "marketBreadth",
  "ppiInflation",
  "fedPolicyRate",
  "fedBalanceSheet",
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
  ppiInflation: "ppi_inflation",
  fedPolicyRate: "fed_policy_rate",
  fedBalanceSheet: "fed_balance_sheet",
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
  ppi_inflation: "ppiInflation",
  fed_policy_rate: "fedPolicyRate",
  fed_balance_sheet: "fedBalanceSheet",
};

export const MARKET_INDICATOR_META_CATALOG_: Record<DaaMarketIndicatorKey, {
  label: string;
  category: DaaMarketIndicatorCategory;
  scope: DaaMarketIndicatorScope;
  unit?: string;
  source: string;
  fixedSymbols: string[];
  meaning: DaaMarketIndicatorMeaning;
}> = {
  vix: {
    label: "美股恐慌指数 (VIX)",
    category: "volatility",
    scope: "us_equity",
    source: "yfinance:^VIX",
    fixedSymbols: ["^VIX"],
    meaning: {
      measurement: "标普 500 隐含波动率，用来观察美股避险情绪和期权定价里的恐慌程度。",
      highSignal: "分位越高，代表美股波动压力越大，当前更不适合盲目加仓。",
      lowSignal: "分位越低，代表波动压力较低，对美股风险资产更友好。",
      neutralSignal: "中性区间表示波动没有形成极端约束，需要结合风格和市场广度判断。",
      usage: "和 QQQ/SPY、RSP/SPY 一起汇总成美股加仓环境，不单独决定订单。",
    },
  },
  qqq_spy_ratio: {
    label: "美股成长/大盘比 (QQQ/SPY)",
    category: "relative_value",
    scope: "us_equity",
    unit: "x",
    source: "yfinance:QQQ/SPY",
    fixedSymbols: ["QQQ", "SPY"],
    meaning: {
      measurement: "QQQ 相对 SPY 的强弱，用来观察科技成长风格相对大盘的进攻性。",
      highSignal: "分位越高，代表成长风格占优，美股风险偏好更活跃。",
      lowSignal: "分位越低，代表资金偏向防守或大盘，进攻型加仓环境转弱。",
      neutralSignal: "中性区间表示风格切换不明显，不能单独解释买入时机。",
      usage: "和 VIX、市场广度一起看美股环境，避免只因科技股强弱就调仓。",
    },
  },
  fxi_volatility: {
    label: "港中概波动率 (FXI)",
    category: "volatility",
    scope: "hk_cn_equity",
    unit: "%",
    source: "yfinance:FXI",
    fixedSymbols: ["FXI"],
    meaning: {
      measurement: "FXI 的 20 日实现波动率，用来观察港股和中概代表资产的波动压力。",
      highSignal: "分位越高，代表港股 / 中概波动放大，新增仓位容错率下降。",
      lowSignal: "分位越低，代表波动环境较平稳，对分批加仓更友好。",
      neutralSignal: "中性区间表示波动没有明显极端，仍需结合 KWEB/FXI 判断风险偏好。",
      usage: "和 KWEB/FXI 合成港股 / 中概加仓环境，不等同于单只港股买卖信号。",
    },
  },
  kweb_fxi_ratio: {
    label: "中概互联/大盘比 (KWEB/FXI)",
    category: "relative_value",
    scope: "hk_cn_equity",
    unit: "x",
    source: "yfinance:KWEB/FXI",
    fixedSymbols: ["KWEB", "FXI"],
    meaning: {
      measurement: "KWEB 相对 FXI 的强弱，用来观察中概互联网和成长风格是否强于港中概大盘。",
      highSignal: "分位越高，代表中概成长风格回暖，风险偏好改善。",
      lowSignal: "分位越低，代表成长风格承压，港股 / 中概进攻预算应下降。",
      neutralSignal: "中性区间表示风格优势不明显，需要结合波动率和个股基本面。",
      usage: "和 FXI 波动率一起看港股 / 中概环境，避免把单一风格强弱当成订单。",
    },
  },
  btc_eth_ratio: {
    label: "比特币/以太坊比 (BTC/ETH)",
    category: "relative_value",
    scope: "crypto",
    unit: "x",
    source: "yfinance:BTC-USD/ETH-USD",
    fixedSymbols: ["BTC-USD", "ETH-USD"],
    meaning: {
      measurement: "BTC 相对 ETH 的强弱，用来观察加密市场在防守 BTC 和进攻型高 beta 资产之间的切换。",
      highSignal: "分位越高，代表 BTC 相对 ETH 过强，通常意味着加密风险偏好收缩。",
      lowSignal: "分位越低，代表 ETH 相对 BTC 更强，通常意味着加密风险偏好改善。",
      neutralSignal: "中性区间表示 BTC 与 ETH 风格切换不明显，不能单独决定加密仓位。",
      usage: "这是加密内部风格信号；需要和 BTC 波动率合成后再判断加密加仓环境。",
    },
  },
  btc_volatility: {
    label: "比特币波动率 (BTC)",
    category: "volatility",
    scope: "crypto",
    unit: "%",
    source: "yfinance:BTC-USD",
    fixedSymbols: ["BTC-USD"],
    meaning: {
      measurement: "BTC 的 20 日实现波动率，用来观察加密核心资产的波动压力。",
      highSignal: "分位越高，代表加密波动压力升高，追加入场需要更高安全边际。",
      lowSignal: "分位越低，代表波动压力缓和，对分批加仓更友好。",
      neutralSignal: "中性区间表示波动没有极端约束，仍需结合 BTC/ETH 风格信号。",
      usage: "它只衡量波动压力，不判断 BTC 方向；需要和 BTC/ETH 合成加密环境。",
    },
  },
  gold_silver_ratio: {
    label: "金银比 (GC/SI)",
    category: "relative_value",
    scope: "macro_defensive",
    unit: "x",
    source: "yfinance:GC=F/SI=F",
    fixedSymbols: ["GC=F", "SI=F"],
    meaning: {
      measurement: "黄金相对白银的强弱，用来观察贵金属内部的防御需求和周期需求。",
      highSignal: "分位越高，代表黄金相对白银更强，宏观资金更偏防御。",
      lowSignal: "分位越低，代表白银相对更强，周期需求和风险偏好更积极。",
      neutralSignal: "中性区间表示贵金属内部没有明显防御倾斜。",
      usage: "这是宏观背景指标，用来提示是否提高现金、黄金、短债等防御仓。",
    },
  },
  yield_curve_spread: {
    label: "收益率曲线斜率 (IEF/SHY)",
    category: "macro",
    scope: "macro_defensive",
    unit: "x",
    source: "yfinance:IEF/SHY",
    fixedSymbols: ["IEF", "SHY"],
    meaning: {
      measurement: "IEF 相对 SHY 的代理指标，用来近似观察中短端利率结构和经济周期压力。",
      highSignal: "分位越高，按当前模型视为曲线环境更健康，衰退压力相对缓和。",
      lowSignal: "分位越低，按当前模型视为曲线压力升高，宏观防御需求增加。",
      neutralSignal: "中性区间表示利率结构没有给出强信号。",
      usage: "这是利率代理，不是官方期限利差；只作为宏观防御背景参与汇总。",
    },
  },
  usd_strength: {
    label: "美元波动压力 (UUP)",
    category: "macro",
    scope: "macro_global",
    unit: "%",
    source: "yfinance:UUP",
    fixedSymbols: ["UUP"],
    meaning: {
      measurement: "UUP 的 20 日实现波动率，用来观察美元波动带来的全球流动性压力。",
      highSignal: "分位越高，代表美元波动压力升高，新兴市场和风险资产更容易承压。",
      lowSignal: "分位越低，代表美元波动较平稳，全球风险资产外部压力较小。",
      neutralSignal: "中性区间表示美元波动没有形成明显宏观约束。",
      usage: "这是宏观压力指标，不是美元方向预测；和通胀、信用一起看全局环境。",
    },
  },
  credit_spread: {
    label: "信用利差 (HYG/LQD)",
    category: "macro",
    scope: "macro_defensive",
    unit: "x",
    source: "yfinance:HYG/LQD",
    fixedSymbols: ["HYG", "LQD"],
    meaning: {
      measurement: "HYG 相对 LQD 的强弱，用来观察高收益信用相对投资级信用的风险偏好。",
      highSignal: "分位越高，代表高收益债表现较强，信用环境更宽松。",
      lowSignal: "分位越低，代表高收益信用承压，信用风险和防御需求升高。",
      neutralSignal: "中性区间表示信用市场没有给出强烈风险偏好变化。",
      usage: "这是宏观防御指标，用来校验股票和加密信号是否有信用风险背书。",
    },
  },
  inflation_expectation: {
    label: "通胀预期 (TIP/IEF)",
    category: "macro",
    scope: "macro_global",
    unit: "x",
    source: "yfinance:TIP/IEF",
    fixedSymbols: ["TIP", "IEF"],
    meaning: {
      measurement: "TIP 相对 IEF 的强弱，用来观察通胀保护债相对名义债的压力。",
      highSignal: "分位越高，代表通胀预期或通胀对冲需求升温，估值和名义债承压。",
      lowSignal: "分位越低，代表通胀压力相对缓和，名义债和久期资产环境改善。",
      neutralSignal: "中性区间表示通胀代理没有形成强约束。",
      usage: "这是宏观全局指标，用来决定是否提高现金和通胀对冲权重。",
    },
  },
  market_breadth: {
    label: "市场广度 (RSP/SPY)",
    category: "macro",
    scope: "us_equity",
    unit: "x",
    source: "yfinance:RSP/SPY",
    fixedSymbols: ["RSP", "SPY"],
    meaning: {
      measurement: "RSP 相对 SPY 的强弱，用来观察美股上涨是否由更广泛股票共同参与。",
      highSignal: "分位越高，代表市场广度更健康，美股风险偏好更扎实。",
      lowSignal: "分位越低，代表涨幅集中在少数权重股，市场结构更脆弱。",
      neutralSignal: "中性区间表示广度没有给出明显风险偏好信号。",
      usage: "和 VIX、QQQ/SPY 一起看美股环境，避免被头部权重股单独误导。",
    },
  },
  ppi_inflation: {
    label: "生产者价格指数 (PPI)",
    category: "macro",
    scope: "macro_policy",
    unit: "%",
    source: "fred:PPIACO",
    fixedSymbols: [],
    meaning: {
      measurement: "PPI 同比变化，用来观察上游通胀压力是否会继续压制利润率、估值和降息空间。",
      highSignal: "PPI 高位或重新上行，通常意味着通胀粘性更强，风险资产估值和降息预期承压。",
      lowSignal: "PPI 低位或持续回落，通常意味着通胀压力缓和，政策转松空间更大。",
      neutralSignal: "中性区间表示生产端价格压力没有形成新的宏观约束。",
      usage: "这是宏观政策维度的通胀压力输入，不直接给出单资产交易指令。",
    },
  },
  fed_policy_rate: {
    label: "政策利率路径 (FEDFUNDS)",
    category: "macro",
    scope: "macro_policy",
    unit: "%",
    source: "fred:FEDFUNDS",
    fixedSymbols: [],
    meaning: {
      measurement: "联邦基金有效利率及其近期变化，用来判断实际加息、维持高利率或降息路径。",
      highSignal: "利率水平高且没有明显回落时，现金和短债吸引力更高，高估值资产折现压力更大。",
      lowSignal: "利率水平较低或已经进入降息趋势时，久期资产和风险资产的外部压力下降。",
      neutralSignal: "中性区间表示政策利率没有给组合节奏带来强约束。",
      usage: "它衡量政策利率环境，不等同于市场对下一次 FOMC 的精确定价。",
    },
  },
  fed_balance_sheet: {
    label: "美联储资产负债表 (WALCL)",
    category: "macro",
    scope: "macro_policy",
    unit: "$T",
    source: "fred:WALCL",
    fixedSymbols: [],
    meaning: {
      measurement: "美联储资产负债表规模及近期变化，用来观察缩表或扩表带来的系统流动性方向。",
      highSignal: "资产负债表持续收缩，代表流动性被抽离，风险资产的流动性折扣应提高。",
      lowSignal: "资产负债表企稳或扩张，代表流动性约束缓和。",
      neutralSignal: "中性区间表示缩表/扩表没有形成明显方向性压力。",
      usage: "这是流动性背景指标，应和美元、信用利差、波动率一起看，而不是单独触发交易。",
    },
  },
};

export const MARKET_SCOPE_KEY_ORDER_: DaaMarketIndicatorScope[] = [
  "us_equity",
  "hk_cn_equity",
  "crypto",
  "macro_defensive",
  "macro_global",
  "macro_policy",
];

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
