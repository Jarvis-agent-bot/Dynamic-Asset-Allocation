export type WorkbenchFeaturedMarket = "US" | "HK" | "CN" | "KR" | "CRYPTO" | "COMMODITY";
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
    symbol: "GC=F", market: "COMMODITY", assetClass: "COMMODITY", name: "Gold Futures Continuous Contract", displayNameZh: "黄金",
    currency: "USD", exchange: "COMEX", thesisTagZh: "黄金价格基准", roleKey: "real_asset", allocationNoteZh: "独立黄金敞口，用于组合里的黄金配置；真实交易时需映射到券商支持的现货、期货或 ETF 工具。", suggestedWeightBandZh: "3%-15%", themeKey: "commodity_resource", themeLabelZh: "商品/资源",
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
    symbol: "0700.HK", market: "HK", assetClass: "EQUITY", name: "Tencent Holdings", displayNameZh: "腾讯控股",
    currency: "HKD", exchange: "HKEX", thesisTagZh: "港股互联网平台", roleKey: "satellite_theme", allocationNoteZh: "港股平台龙头，适合作为中国互联网敞口的观察仓。", suggestedWeightBandZh: "0%-8%", themeKey: "satellite_theme", themeLabelZh: "平台龙头",
  }),
  withRole({
    symbol: "1810.HK", market: "HK", assetClass: "EQUITY", name: "Xiaomi Corporation", displayNameZh: "小米集团",
    currency: "HKD", exchange: "HKEX", thesisTagZh: "消费电子与智能汽车", roleKey: "satellite_theme", allocationNoteZh: "消费电子、IoT 与智能汽车主题，波动高于宽基，应小比例观察。", suggestedWeightBandZh: "0%-6%", themeKey: "satellite_theme", themeLabelZh: "平台龙头",
  }),
  withRole({
    symbol: "AAPL", market: "US", assetClass: "EQUITY", name: "Apple Inc.", displayNameZh: "苹果",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "美股七姐妹", roleKey: "satellite_theme", allocationNoteZh: "高质量消费科技龙头，适合作为美股大盘之外的卫星观察。", suggestedWeightBandZh: "0%-8%", themeKey: "satellite_theme", themeLabelZh: "美股七姐妹",
  }),
  withRole({
    symbol: "MSFT", market: "US", assetClass: "EQUITY", name: "Microsoft Corporation", displayNameZh: "微软",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "云计算与 AI 平台", roleKey: "satellite_theme", allocationNoteZh: "云和企业 AI 平台龙头，适合观察估值与盈利韧性。", suggestedWeightBandZh: "0%-8%", themeKey: "satellite_theme", themeLabelZh: "美股七姐妹",
  }),
  withRole({
    symbol: "NVDA", market: "US", assetClass: "EQUITY", name: "NVIDIA Corporation", displayNameZh: "英伟达",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "AI 算力核心", roleKey: "satellite_theme", allocationNoteZh: "AI 算力核心标的，景气弹性强但估值和回撤风险也高。", suggestedWeightBandZh: "0%-8%", themeKey: "semiconductor", themeLabelZh: "半导体",
  }),
  withRole({
    symbol: "AMZN", market: "US", assetClass: "EQUITY", name: "Amazon.com Inc.", displayNameZh: "亚马逊",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "云与电商平台", roleKey: "satellite_theme", allocationNoteZh: "云计算和电商平台龙头，可用于观察消费与云资本开支周期。", suggestedWeightBandZh: "0%-8%", themeKey: "satellite_theme", themeLabelZh: "美股七姐妹",
  }),
  withRole({
    symbol: "GOOGL", market: "US", assetClass: "EQUITY", name: "Alphabet Inc.", displayNameZh: "谷歌",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "搜索广告与 AI", roleKey: "satellite_theme", allocationNoteZh: "广告、云和 AI 模型能力共同驱动，适合作为平台科技观察仓。", suggestedWeightBandZh: "0%-8%", themeKey: "satellite_theme", themeLabelZh: "美股七姐妹",
  }),
  withRole({
    symbol: "META", market: "US", assetClass: "EQUITY", name: "Meta Platforms", displayNameZh: "Meta",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "社交广告与 AI", roleKey: "satellite_theme", allocationNoteZh: "广告现金流和 AI 推荐效率相关，适合小比例卫星配置。", suggestedWeightBandZh: "0%-8%", themeKey: "satellite_theme", themeLabelZh: "美股七姐妹",
  }),
  withRole({
    symbol: "TSLA", market: "US", assetClass: "EQUITY", name: "Tesla Inc.", displayNameZh: "特斯拉",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "电动车与机器人", roleKey: "satellite_theme", allocationNoteZh: "成长叙事弹性大，价格波动和预期差都较强，应严格控制仓位。", suggestedWeightBandZh: "0%-6%", themeKey: "satellite_theme", themeLabelZh: "美股七姐妹",
  }),

  withRole({
    symbol: "SMH", market: "US", assetClass: "ETF", name: "VanEck Semiconductor ETF", displayNameZh: "半导体 ETF",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "半导体产业链", roleKey: "satellite_theme", allocationNoteZh: "高景气主题仓，适合小比例增强。", suggestedWeightBandZh: "0%-12%", themeKey: "semiconductor", themeLabelZh: "半导体",
  }),
  withRole({
    symbol: "MU", market: "US", assetClass: "EQUITY", name: "Micron Technology", displayNameZh: "美光科技",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "存储周期", roleKey: "satellite_theme", allocationNoteZh: "存储价格周期和 AI 服务器需求相关，适合作为存储主题观察仓。", suggestedWeightBandZh: "0%-5%", themeKey: "semiconductor", themeLabelZh: "半导体",
  }),
  withRole({
    symbol: "000660.KS", market: "KR", assetClass: "EQUITY", name: "SK hynix", displayNameZh: "SK 海力士",
    currency: "KRW", exchange: "KRX", thesisTagZh: "HBM 存储", roleKey: "satellite_theme", allocationNoteZh: "HBM 和高端存储代表，适合跟踪 AI 服务器存储景气度。", suggestedWeightBandZh: "0%-5%", themeKey: "semiconductor", themeLabelZh: "半导体",
  }),
  withRole({
    symbol: "AVGO", market: "US", assetClass: "EQUITY", name: "Broadcom Inc.", displayNameZh: "博通",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "AI 网络与定制芯片", roleKey: "satellite_theme", allocationNoteZh: "网络芯片与定制 ASIC 暴露，适合观察 AI 基建资本开支。", suggestedWeightBandZh: "0%-6%", themeKey: "semiconductor", themeLabelZh: "半导体",
  }),
  withRole({
    symbol: "AMD", market: "US", assetClass: "EQUITY", name: "Advanced Micro Devices", displayNameZh: "AMD",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "AI 加速器与 CPU", roleKey: "satellite_theme", allocationNoteZh: "GPU/CPU 竞争格局标的，适合和英伟达、台积电一起观察。", suggestedWeightBandZh: "0%-6%", themeKey: "semiconductor", themeLabelZh: "半导体",
  }),
  withRole({
    symbol: "TSM", market: "US", assetClass: "EQUITY", name: "Taiwan Semiconductor Manufacturing", displayNameZh: "台积电",
    currency: "USD", exchange: "NYSE", thesisTagZh: "先进制程代工", roleKey: "satellite_theme", allocationNoteZh: "先进制程和 AI 芯片代工核心，适合代表半导体制造环节。", suggestedWeightBandZh: "0%-6%", themeKey: "semiconductor", themeLabelZh: "半导体",
  }),
  withRole({
    symbol: "ASML", market: "US", assetClass: "EQUITY", name: "ASML Holding", displayNameZh: "阿斯麦",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "光刻机设备", roleKey: "satellite_theme", allocationNoteZh: "半导体设备稀缺环节，适合观察先进制程资本开支周期。", suggestedWeightBandZh: "0%-5%", themeKey: "semiconductor", themeLabelZh: "半导体",
  }),
  withRole({
    symbol: "ARM", market: "US", assetClass: "EQUITY", name: "Arm Holdings", displayNameZh: "Arm",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "芯片架构授权", roleKey: "satellite_theme", allocationNoteZh: "芯片架构授权模式，适合作为 AI 终端与服务器芯片生态观察项。", suggestedWeightBandZh: "0%-5%", themeKey: "semiconductor", themeLabelZh: "半导体",
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

  // ── A 股核心宽基扩展 ──
  withRole({
    symbol: "510500.SS", market: "CN", assetClass: "ETF", name: "CSI 500 ETF", displayNameZh: "中证 500 ETF",
    currency: "CNY", exchange: "SSE", thesisTagZh: "A 股中盘成长", roleKey: "regional_diversifier", allocationNoteZh: "A 股中盘代表，配合沪深 300 补全大中盘敞口。", suggestedWeightBandZh: "0%-10%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),
  withRole({
    symbol: "159915.SZ", market: "CN", assetClass: "ETF", name: "ChiNext ETF", displayNameZh: "创业板 ETF",
    currency: "CNY", exchange: "SZSE", thesisTagZh: "A 股成长板块", roleKey: "satellite_theme", allocationNoteZh: "创业板高弹性，适合作为成长主题小比例配置。", suggestedWeightBandZh: "0%-8%", themeKey: "satellite_theme", themeLabelZh: "A 股成长",
  }),
  withRole({
    symbol: "510880.SS", market: "CN", assetClass: "ETF", name: "Dividend ETF", displayNameZh: "上证红利 ETF",
    currency: "CNY", exchange: "SSE", thesisTagZh: "A 股高股息", roleKey: "defensive_bond", allocationNoteZh: "A 股高股息低波动代表，可承担防守收益角色。", suggestedWeightBandZh: "0%-12%", themeKey: "defensive_income", themeLabelZh: "防守收益",
  }),

  // ── A 股白马股 ──
  withRole({
    symbol: "600519.SS", market: "CN", assetClass: "EQUITY", name: "Kweichow Moutai", displayNameZh: "贵州茅台",
    currency: "CNY", exchange: "SSE", thesisTagZh: "高端消费龙头", roleKey: "satellite_theme", allocationNoteZh: "高端白酒龙头，估值和消费景气共同驱动。", suggestedWeightBandZh: "0%-6%", themeKey: "satellite_theme", themeLabelZh: "A 股白马",
  }),
  withRole({
    symbol: "300750.SZ", market: "CN", assetClass: "EQUITY", name: "Contemporary Amperex Technology (CATL)", displayNameZh: "宁德时代",
    currency: "CNY", exchange: "SZSE", thesisTagZh: "动力电池龙头", roleKey: "satellite_theme", allocationNoteZh: "全球动力电池龙头，新能源汽车与储能景气敞口。", suggestedWeightBandZh: "0%-6%", themeKey: "satellite_theme", themeLabelZh: "A 股白马",
  }),
  withRole({
    symbol: "601318.SS", market: "CN", assetClass: "EQUITY", name: "Ping An Insurance", displayNameZh: "中国平安",
    currency: "CNY", exchange: "SSE", thesisTagZh: "保险与综合金融", roleKey: "satellite_theme", allocationNoteZh: "保险与综合金融，受利率与寿险新业务价值驱动。", suggestedWeightBandZh: "0%-5%", themeKey: "satellite_theme", themeLabelZh: "A 股白马",
  }),
  withRole({
    symbol: "600036.SS", market: "CN", assetClass: "EQUITY", name: "China Merchants Bank", displayNameZh: "招商银行",
    currency: "CNY", exchange: "SSE", thesisTagZh: "零售银行龙头", roleKey: "satellite_theme", allocationNoteZh: "零售银行龙头，关注净息差、信贷质量与高股息。", suggestedWeightBandZh: "0%-5%", themeKey: "satellite_theme", themeLabelZh: "A 股白马",
  }),
  withRole({
    symbol: "002594.SZ", market: "CN", assetClass: "EQUITY", name: "BYD Company", displayNameZh: "比亚迪",
    currency: "CNY", exchange: "SZSE", thesisTagZh: "新能源汽车龙头", roleKey: "satellite_theme", allocationNoteZh: "新能源汽车产业链龙头，涵盖电池、整车、储能。", suggestedWeightBandZh: "0%-5%", themeKey: "satellite_theme", themeLabelZh: "A 股白马",
  }),

  // ── 港股扩展 ──
  withRole({
    symbol: "3690.HK", market: "HK", assetClass: "EQUITY", name: "Meituan", displayNameZh: "美团",
    currency: "HKD", exchange: "HKEX", thesisTagZh: "本地生活平台", roleKey: "satellite_theme", allocationNoteZh: "本地生活与即时零售平台，关注外卖到家与到店利润率。", suggestedWeightBandZh: "0%-6%", themeKey: "satellite_theme", themeLabelZh: "港股平台",
  }),
  withRole({
    symbol: "9988.HK", market: "HK", assetClass: "EQUITY", name: "Alibaba Group", displayNameZh: "阿里巴巴",
    currency: "HKD", exchange: "HKEX", thesisTagZh: "电商与云计算", roleKey: "satellite_theme", allocationNoteZh: "电商主业与云业务双轮，估值受电商竞争与回购影响。", suggestedWeightBandZh: "0%-6%", themeKey: "satellite_theme", themeLabelZh: "港股平台",
  }),
  withRole({
    symbol: "1211.HK", market: "HK", assetClass: "EQUITY", name: "BYD Company (H Share)", displayNameZh: "比亚迪股份 H 股",
    currency: "HKD", exchange: "HKEX", thesisTagZh: "新能源汽车 H 股", roleKey: "satellite_theme", allocationNoteZh: "比亚迪港股通道，可与 A 股配合做 AH 折溢价观察。", suggestedWeightBandZh: "0%-5%", themeKey: "satellite_theme", themeLabelZh: "港股平台",
  }),
  withRole({
    symbol: "0883.HK", market: "HK", assetClass: "EQUITY", name: "CNOOC Limited", displayNameZh: "中海油",
    currency: "HKD", exchange: "HKEX", thesisTagZh: "油气与高股息", roleKey: "real_asset", allocationNoteZh: "上游油气敞口，分红与油价杠杆兼具。", suggestedWeightBandZh: "0%-5%", themeKey: "commodity_resource", themeLabelZh: "商品/资源",
  }),
  withRole({
    symbol: "0941.HK", market: "HK", assetClass: "EQUITY", name: "China Mobile", displayNameZh: "中国移动",
    currency: "HKD", exchange: "HKEX", thesisTagZh: "高股息通信", roleKey: "defensive_bond", allocationNoteZh: "高股息低波动通信龙头，可承担稳健收益角色。", suggestedWeightBandZh: "0%-8%", themeKey: "defensive_income", themeLabelZh: "防守收益",
  }),

  // ── 日股 / 欧股 / 印度区域 ETF（US-listed，便于统一行情通路） ──
  withRole({
    symbol: "EWJ", market: "US", assetClass: "ETF", name: "iShares MSCI Japan ETF", displayNameZh: "日本股票 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "日本市场宽基", roleKey: "regional_diversifier", allocationNoteZh: "MSCI 日本指数敞口，承担日股区域多元化。", suggestedWeightBandZh: "0%-15%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),
  withRole({
    symbol: "DXJ", market: "US", assetClass: "ETF", name: "WisdomTree Japan Hedged Equity Fund", displayNameZh: "日股汇率对冲 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "日股 + 日元对冲", roleKey: "regional_diversifier", allocationNoteZh: "对冲日元下跌的日股敞口，适合美元基准账户。", suggestedWeightBandZh: "0%-10%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),
  withRole({
    symbol: "VGK", market: "US", assetClass: "ETF", name: "Vanguard FTSE Europe ETF", displayNameZh: "欧洲股票 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "欧洲发达市场", roleKey: "regional_diversifier", allocationNoteZh: "FTSE 欧洲发达市场敞口。", suggestedWeightBandZh: "0%-15%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),
  withRole({
    symbol: "HEDJ", market: "US", assetClass: "ETF", name: "WisdomTree Europe Hedged Equity Fund", displayNameZh: "欧股欧元对冲 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "欧股 + 欧元对冲", roleKey: "regional_diversifier", allocationNoteZh: "对冲欧元波动的欧股敞口，适合美元基准账户。", suggestedWeightBandZh: "0%-10%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),
  withRole({
    symbol: "INDA", market: "US", assetClass: "ETF", name: "iShares MSCI India ETF", displayNameZh: "印度股票 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "印度长期成长", roleKey: "regional_diversifier", allocationNoteZh: "印度大盘敞口，适合作为新兴市场结构性增长。", suggestedWeightBandZh: "0%-10%", themeKey: "global_region", themeLabelZh: "全球区域",
  }),

  // ── 短债与浮息（cash_buffer 强化） ──
  withRole({
    symbol: "SHV", market: "US", assetClass: "BOND", name: "iShares Short Treasury Bond ETF", displayNameZh: "1 年内美国短债 ETF",
    currency: "USD", exchange: "NASDAQ", thesisTagZh: "短期国债", roleKey: "cash_buffer", allocationNoteZh: "1 年内国债敞口，作为 SGOV/BIL 之外的现金替代选项。", suggestedWeightBandZh: "0%-25%", themeKey: "cash_equivalent", themeLabelZh: "现金替代",
  }),
  withRole({
    symbol: "USFR", market: "US", assetClass: "BOND", name: "WisdomTree Floating Rate Treasury Fund", displayNameZh: "美国浮息国债 ETF",
    currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "浮息国债", roleKey: "cash_buffer", allocationNoteZh: "浮息国债，对短端利率上行敏感度低于固定票息短债。", suggestedWeightBandZh: "0%-20%", themeKey: "cash_equivalent", themeLabelZh: "现金替代",
  }),
];
