export type WorkbenchFeaturedMarket = "US" | "HK" | "CN" | "KR" | "CRYPTO";
export type WorkbenchFeaturedAssetClass = "EQUITY" | "ETF" | "BOND" | "COMMODITY" | "CRYPTO" | "CURRENCY";

export type WorkbenchFeaturedTheme =
  | "core_equity"
  | "global_region"
  | "defensive_income"
  | "commodity_resource"
  | "cash_equivalent"
  | "satellite_theme"
  | "crypto"
  | "currency_hedge"
  | "semiconductor"
  | "cybersecurity"
  | "robotics";

export type WorkbenchFeaturedRole =
  | "cash_buffer"
  | "core_equity"
  | "defensive_bond"
  | "real_asset"
  | "regional_diversifier"
  | "satellite_theme"
  | "crypto_optional"
  | "currency_hedge";

export type WorkbenchFeaturedCatalogItem = {
  symbol: string;
  market: WorkbenchFeaturedMarket;
  assetClass: WorkbenchFeaturedAssetClass;
  name: string;
  displayNameZh: string;
  currency: string;
  exchange: string;
  thesisTagZh: string;
  roleKey: WorkbenchFeaturedRole;
  roleLabelZh: string;
  roleDescriptionZh: string;
  allocationNoteZh: string;
  suggestedWeightBandZh: string;
  themeKey: WorkbenchFeaturedTheme;
  themeLabelZh: string;
};

const ROLE_META_: Record<WorkbenchFeaturedRole, { label: string; description: string }> = {
  cash_buffer: {
    label: "现金与短债",
    description: "组合流动性与低波动底仓，承担等待机会、降低回撤的角色。",
  },
  core_equity: {
    label: "核心股票敞口",
    description: "组合长期增长引擎，优先使用宽基 ETF，避免一开始就堆太多个股。",
  },
  defensive_bond: {
    label: "防守债券",
    description: "用于降低组合波动、管理久期与信用风险。",
  },
  real_asset: {
    label: "黄金与实物资产",
    description: "通胀、地缘风险和美元波动的对冲层，包含黄金、白银与商品篮子。",
  },
  regional_diversifier: {
    label: "区域分散",
    description: "在美国以外补充地区风险暴露，服务于全球资产配置。",
  },
  satellite_theme: {
    label: "卫星主题",
    description: "增强收益弹性的主题仓位，应小比例、强约束使用。",
  },
  crypto_optional: {
    label: "加密可选",
    description: "高波动另类资产，只适合小比例或观察仓位。",
  },
  currency_hedge: {
    label: "汇率对冲",
    description: "用于美元、日元等货币风险表达，不应替代现金管理。",
  },
};

function withRole(input: Omit<WorkbenchFeaturedCatalogItem, "roleLabelZh" | "roleDescriptionZh">): WorkbenchFeaturedCatalogItem {
  const role = ROLE_META_[input.roleKey];
  return {
    ...input,
    roleLabelZh: role.label,
    roleDescriptionZh: role.description,
  };
}

export const WORKBENCH_FEATURED_ROLE_ORDER_: WorkbenchFeaturedRole[] = [
  "cash_buffer",
  "core_equity",
  "defensive_bond",
  "real_asset",
  "regional_diversifier",
  "satellite_theme",
  "crypto_optional",
  "currency_hedge",
];

export const WORKBENCH_FEATURED_ASSETS_CATALOG_: WorkbenchFeaturedCatalogItem[] = [
  withRole({
    symbol: "SGOV", market: "US", assetClass: "BOND", name: "iShares 0-3 Month Treasury Bond ETF", displayNameZh: "0-3 月美国国债 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "现金替代", roleKey: "cash_buffer", allocationNoteZh: "适合作为美元现金缓冲，波动低、久期短。", suggestedWeightBandZh: "5%-30%", themeKey: "cash_equivalent", themeLabelZh: "现金替代",
  }),
  withRole({
    symbol: "BIL", market: "US", assetClass: "BOND", name: "SPDR Bloomberg 1-3 Month T-Bill ETF", displayNameZh: "1-3 月美国短债 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "短债现金管理", roleKey: "cash_buffer", allocationNoteZh: "现金管理工具，适合等待再平衡机会。", suggestedWeightBandZh: "5%-30%", themeKey: "cash_equivalent", themeLabelZh: "现金替代",
  }),

  withRole({
    symbol: "VTI", market: "US", assetClass: "ETF", name: "Vanguard Total Stock Market ETF", displayNameZh: "美国全市场股票 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "美股核心底仓", roleKey: "core_equity", allocationNoteZh: "覆盖美国大中小盘，可作为股票主仓。", suggestedWeightBandZh: "15%-60%", themeKey: "core_equity", themeLabelZh: "核心股票",
  }),
  withRole({
    symbol: "SPY", market: "US", assetClass: "ETF", name: "SPDR S&P 500 ETF", displayNameZh: "标普 500 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "美股大盘核心", roleKey: "core_equity", allocationNoteZh: "流动性强，适合承担美股大盘敞口。", suggestedWeightBandZh: "10%-50%", themeKey: "core_equity", themeLabelZh: "核心股票",
  }),
  withRole({
    symbol: "QQQ", market: "US", assetClass: "ETF", name: "Invesco QQQ", displayNameZh: "纳斯达克 100 ETF",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "成长股核心", roleKey: "core_equity", allocationNoteZh: "成长风格更强，波动高于宽基核心仓。", suggestedWeightBandZh: "5%-30%", themeKey: "core_equity", themeLabelZh: "核心股票",
  }),
  withRole({
    symbol: "VT", market: "US", assetClass: "ETF", name: "Vanguard Total World Stock ETF", displayNameZh: "全球股票 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "全球股票底仓", roleKey: "core_equity", allocationNoteZh: "一只 ETF 覆盖全球股票市场，适合简化配置。", suggestedWeightBandZh: "10%-60%", themeKey: "core_equity", themeLabelZh: "核心股票",
  }),

  withRole({
    symbol: "BND", market: "US", assetClass: "BOND", name: "Vanguard Total Bond Market ETF", displayNameZh: "美国综合债券 ETF",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "债券底仓", roleKey: "defensive_bond", allocationNoteZh: "覆盖美国综合债券市场，是防守仓常用底仓。", suggestedWeightBandZh: "10%-50%", themeKey: "defensive_income", themeLabelZh: "防守收益",
  }),
  withRole({
    symbol: "IEF", market: "US", assetClass: "BOND", name: "iShares 7-10 Year Treasury Bond ETF", displayNameZh: "7-10 年美国国债 ETF",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "中期国债", roleKey: "defensive_bond", allocationNoteZh: "中等久期，适合平衡防守与利率弹性。", suggestedWeightBandZh: "5%-30%", themeKey: "defensive_income", themeLabelZh: "防守收益",
  }),
  withRole({
    symbol: "TLT", market: "US", assetClass: "BOND", name: "iShares 20+ Year Treasury Bond ETF", displayNameZh: "20 年以上美国国债 ETF",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "长久期利率弹性", roleKey: "defensive_bond", allocationNoteZh: "利率敏感度高，适合明确需要长久期时小比例配置。", suggestedWeightBandZh: "0%-20%", themeKey: "defensive_income", themeLabelZh: "防守收益",
  }),
  withRole({
    symbol: "TIP", market: "US", assetClass: "BOND", name: "iShares TIPS Bond ETF", displayNameZh: "美国通胀保护债 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "通胀保护", roleKey: "defensive_bond", allocationNoteZh: "用于补充通胀保护，不替代黄金商品层。", suggestedWeightBandZh: "0%-20%", themeKey: "defensive_income", themeLabelZh: "防守收益",
  }),

  withRole({
    symbol: "GLD", market: "US", assetClass: "COMMODITY", name: "SPDR Gold Shares", displayNameZh: "黄金 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "黄金现货代理", roleKey: "real_asset", allocationNoteZh: "黄金核心敞口，用于抗通胀与避险。", suggestedWeightBandZh: "3%-15%", themeKey: "commodity_resource", themeLabelZh: "商品/资源",
  }),
  withRole({
    symbol: "IAU", market: "US", assetClass: "COMMODITY", name: "iShares Gold Trust", displayNameZh: "低费率黄金 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "黄金低费率配置", roleKey: "real_asset", allocationNoteZh: "黄金替代选择，适合长期低成本持有。", suggestedWeightBandZh: "3%-15%", themeKey: "commodity_resource", themeLabelZh: "商品/资源",
  }),
  withRole({
    symbol: "SLV", market: "US", assetClass: "COMMODITY", name: "iShares Silver Trust", displayNameZh: "白银 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "白银波动弹性", roleKey: "real_asset", allocationNoteZh: "白银波动更高，适合作为小比例商品增强。", suggestedWeightBandZh: "0%-8%", themeKey: "commodity_resource", themeLabelZh: "商品/资源",
  }),
  withRole({
    symbol: "DBC", market: "US", assetClass: "COMMODITY", name: "Invesco DB Commodity Index Tracking Fund", displayNameZh: "综合商品 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "综合商品篮子", roleKey: "real_asset", allocationNoteZh: "覆盖能源、金属、农产品等商品篮子。", suggestedWeightBandZh: "0%-10%", themeKey: "commodity_resource", themeLabelZh: "商品/资源",
  }),

  withRole({
    symbol: "EFA", market: "US", assetClass: "ETF", name: "iShares MSCI EAFE ETF", displayNameZh: "发达市场股票 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "发达市场除美国", roleKey: "regional_diversifier", allocationNoteZh: "补充美国以外发达市场股票敞口。", suggestedWeightBandZh: "0%-25%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),
  withRole({
    symbol: "EEM", market: "US", assetClass: "ETF", name: "iShares MSCI Emerging Markets ETF", displayNameZh: "新兴市场股票 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "新兴市场篮子", roleKey: "regional_diversifier", allocationNoteZh: "新兴市场整体敞口，波动和政策风险更高。", suggestedWeightBandZh: "0%-20%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),
  withRole({
    symbol: "2800.HK", market: "HK", assetClass: "ETF", name: "Tracker Fund of Hong Kong", displayNameZh: "香港盈富基金",
    currency: "HKD", exchange: "HKEX", thesisTagZh: "港股宽基", roleKey: "regional_diversifier", allocationNoteZh: "港股大盘代表，适合表达香港市场敞口。", suggestedWeightBandZh: "0%-15%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),
  withRole({
    symbol: "510300.SS", market: "CN", assetClass: "ETF", name: "CSI 300 ETF", displayNameZh: "沪深 300 ETF",
    currency: "CNY", exchange: "SSE", thesisTagZh: "A股核心宽基", roleKey: "regional_diversifier", allocationNoteZh: "A 股大盘核心敞口。", suggestedWeightBandZh: "0%-15%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),

  withRole({
    symbol: "SMH", market: "US", assetClass: "ETF", name: "VanEck Semiconductor ETF", displayNameZh: "半导体 ETF",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "半导体产业链", roleKey: "satellite_theme", allocationNoteZh: "高景气主题仓，适合小比例增强。", suggestedWeightBandZh: "0%-12%", themeKey: "semiconductor", themeLabelZh: "半导体",
  }),
  withRole({
    symbol: "BOTZ", market: "US", assetClass: "ETF", name: "Global X Robotics & Artificial Intelligence ETF", displayNameZh: "机器人与人工智能 ETF",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "机器人与自动化", roleKey: "satellite_theme", allocationNoteZh: "主题弹性较高，不应替代核心股票仓。", suggestedWeightBandZh: "0%-8%", themeKey: "robotics", themeLabelZh: "机器人/自动化",
  }),
  withRole({
    symbol: "CIBR", market: "US", assetClass: "ETF", name: "First Trust Nasdaq Cybersecurity ETF", displayNameZh: "网络安全 ETF",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "网络安全主题", roleKey: "satellite_theme", allocationNoteZh: "安全软件主题，适合卫星仓观察。", suggestedWeightBandZh: "0%-8%", themeKey: "cybersecurity", themeLabelZh: "网络安全",
  }),

  withRole({
    symbol: "BTC-USD", market: "CRYPTO", assetClass: "CRYPTO", name: "Bitcoin", displayNameZh: "比特币",
    currency: "USD", exchange: "CRYPTO", thesisTagZh: "加密锚资产", roleKey: "crypto_optional", allocationNoteZh: "高波动另类资产，建议严格小比例。", suggestedWeightBandZh: "0%-5%", themeKey: "crypto", themeLabelZh: "加密",
  }),
  withRole({
    symbol: "ETH-USD", market: "CRYPTO", assetClass: "CRYPTO", name: "Ethereum", displayNameZh: "以太坊",
    currency: "USD", exchange: "CRYPTO", thesisTagZh: "智能合约核心", roleKey: "crypto_optional", allocationNoteZh: "高波动资产，适合作为可选观察仓。", suggestedWeightBandZh: "0%-5%", themeKey: "crypto", themeLabelZh: "加密",
  }),

  withRole({
    symbol: "UUP", market: "US", assetClass: "CURRENCY", name: "Invesco DB US Dollar Index Bullish Fund", displayNameZh: "美元指数多头 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "美元汇率对冲", roleKey: "currency_hedge", allocationNoteZh: "用于表达美元强势或对冲非美元资产。", suggestedWeightBandZh: "0%-10%", themeKey: "currency_hedge", themeLabelZh: "汇率对冲",
  }),
  withRole({
    symbol: "FXY", market: "US", assetClass: "CURRENCY", name: "Invesco CurrencyShares Japanese Yen Trust", displayNameZh: "日元 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "日元避险敞口", roleKey: "currency_hedge", allocationNoteZh: "用于小比例表达日元避险属性。", suggestedWeightBandZh: "0%-8%", themeKey: "currency_hedge", themeLabelZh: "汇率对冲",
  }),
];
