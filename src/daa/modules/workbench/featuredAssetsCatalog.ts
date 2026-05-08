export type WorkbenchFeaturedMarket = "US" | "HK" | "CN" | "KR" | "CRYPTO";
export type WorkbenchFeaturedAssetClass = "EQUITY" | "ETF" | "BOND" | "COMMODITY" | "CRYPTO" | "CURRENCY";
export type WorkbenchFeaturedTheme =
  | "mega_cap"
  | "ai_compute"
  | "ai_infrastructure"
  | "semiconductor"
  | "memory_storage"
  | "optical_networking"
  | "platform"
  | "ai_software"
  | "power_grid"
  | "robotics"
  | "cybersecurity"
  | "china_core"
  | "global_region"
  | "broad_etf"
  | "defensive_income"
  | "commodity_resource"
  | "crypto";

type WorkbenchFeaturedCatalogItem = {
  symbol: string;
  market: WorkbenchFeaturedMarket;
  assetClass: WorkbenchFeaturedAssetClass;
  name: string;
  currency: string;
  exchange: string;
  thesisTagZh: string;
  themeKey?: WorkbenchFeaturedTheme;
  themeLabelZh?: string;
};

export const WORKBENCH_FEATURED_ASSETS_CATALOG_: WorkbenchFeaturedCatalogItem[] = [
  { symbol: "AAPL", market: "US", assetClass: "EQUITY", name: "Apple", currency: "USD", exchange: "NASDAQ", thesisTagZh: "消费电子龙头" },
  { symbol: "MSFT", market: "US", assetClass: "EQUITY", name: "Microsoft", currency: "USD", exchange: "NASDAQ", thesisTagZh: "企业软件与云" },
  { symbol: "NVDA", market: "US", assetClass: "EQUITY", name: "NVIDIA", currency: "USD", exchange: "NASDAQ", thesisTagZh: "AI算力核心" },
  { symbol: "TSM", market: "US", assetClass: "EQUITY", name: "Taiwan Semiconductor", currency: "USD", exchange: "NYSE", thesisTagZh: "先进制程代工", themeKey: "semiconductor", themeLabelZh: "半导体" },
  { symbol: "ASML", market: "US", assetClass: "EQUITY", name: "ASML Holding", currency: "USD", exchange: "NASDAQ", thesisTagZh: "EUV光刻机核心", themeKey: "semiconductor", themeLabelZh: "半导体" },
  { symbol: "AVGO", market: "US", assetClass: "EQUITY", name: "Broadcom", currency: "USD", exchange: "NASDAQ", thesisTagZh: "AI网络与定制芯片", themeKey: "ai_compute", themeLabelZh: "AI算力" },
  { symbol: "AMD", market: "US", assetClass: "EQUITY", name: "Advanced Micro Devices", currency: "USD", exchange: "NASDAQ", thesisTagZh: "AI GPU与CPU", themeKey: "ai_compute", themeLabelZh: "AI算力" },
  { symbol: "ARM", market: "US", assetClass: "EQUITY", name: "Arm Holdings", currency: "USD", exchange: "NASDAQ", thesisTagZh: "低功耗芯片架构", themeKey: "semiconductor", themeLabelZh: "半导体" },
  { symbol: "AMAT", market: "US", assetClass: "EQUITY", name: "Applied Materials", currency: "USD", exchange: "NASDAQ", thesisTagZh: "晶圆制造设备", themeKey: "semiconductor", themeLabelZh: "半导体" },
  { symbol: "LRCX", market: "US", assetClass: "EQUITY", name: "Lam Research", currency: "USD", exchange: "NASDAQ", thesisTagZh: "刻蚀与沉积设备", themeKey: "semiconductor", themeLabelZh: "半导体" },
  { symbol: "KLAC", market: "US", assetClass: "EQUITY", name: "KLA", currency: "USD", exchange: "NASDAQ", thesisTagZh: "良率检测设备", themeKey: "semiconductor", themeLabelZh: "半导体" },
  { symbol: "MRVL", market: "US", assetClass: "EQUITY", name: "Marvell Technology", currency: "USD", exchange: "NASDAQ", thesisTagZh: "数据中心互连芯片", themeKey: "ai_compute", themeLabelZh: "AI算力" },
  { symbol: "ANET", market: "US", assetClass: "EQUITY", name: "Arista Networks", currency: "USD", exchange: "NYSE", thesisTagZh: "AI集群以太网", themeKey: "optical_networking", themeLabelZh: "光互联/网络" },
  { symbol: "CIEN", market: "US", assetClass: "EQUITY", name: "Ciena", currency: "USD", exchange: "NYSE", thesisTagZh: "高速光网络设备", themeKey: "optical_networking", themeLabelZh: "光互联/网络" },
  { symbol: "COHR", market: "US", assetClass: "EQUITY", name: "Coherent", currency: "USD", exchange: "NYSE", thesisTagZh: "光模块与材料", themeKey: "optical_networking", themeLabelZh: "光互联/网络" },
  { symbol: "LITE", market: "US", assetClass: "EQUITY", name: "Lumentum", currency: "USD", exchange: "NASDAQ", thesisTagZh: "光通信组件", themeKey: "optical_networking", themeLabelZh: "光互联/网络" },
  { symbol: "MU", market: "US", assetClass: "EQUITY", name: "Micron Technology", currency: "USD", exchange: "NASDAQ", thesisTagZh: "HBM与DRAM周期", themeKey: "memory_storage", themeLabelZh: "存储/内存" },
  { symbol: "SNDK", market: "US", assetClass: "EQUITY", name: "SanDisk", currency: "USD", exchange: "NASDAQ", thesisTagZh: "NAND与存储设备", themeKey: "memory_storage", themeLabelZh: "存储/内存" },
  { symbol: "VRT", market: "US", assetClass: "EQUITY", name: "Vertiv", currency: "USD", exchange: "NYSE", thesisTagZh: "数据中心供电与冷却", themeKey: "ai_infrastructure", themeLabelZh: "AI基础设施" },
  { symbol: "DLR", market: "US", assetClass: "EQUITY", name: "Digital Realty", currency: "USD", exchange: "NYSE", thesisTagZh: "数据中心REIT", themeKey: "ai_infrastructure", themeLabelZh: "AI基础设施" },
  { symbol: "EQIX", market: "US", assetClass: "EQUITY", name: "Equinix", currency: "USD", exchange: "NASDAQ", thesisTagZh: "互联数据中心", themeKey: "ai_infrastructure", themeLabelZh: "AI基础设施" },
  { symbol: "ETN", market: "US", assetClass: "EQUITY", name: "Eaton", currency: "USD", exchange: "NYSE", thesisTagZh: "电力管理与配电", themeKey: "power_grid", themeLabelZh: "电力/电网" },
  { symbol: "GEV", market: "US", assetClass: "EQUITY", name: "GE Vernova", currency: "USD", exchange: "NYSE", thesisTagZh: "电力设备与电网", themeKey: "power_grid", themeLabelZh: "电力/电网" },
  { symbol: "CEG", market: "US", assetClass: "EQUITY", name: "Constellation Energy", currency: "USD", exchange: "NASDAQ", thesisTagZh: "核电与低碳电力", themeKey: "power_grid", themeLabelZh: "电力/电网" },
  { symbol: "VST", market: "US", assetClass: "EQUITY", name: "Vistra", currency: "USD", exchange: "NYSE", thesisTagZh: "发电侧电力弹性", themeKey: "power_grid", themeLabelZh: "电力/电网" },
  { symbol: "NEE", market: "US", assetClass: "EQUITY", name: "NextEra Energy", currency: "USD", exchange: "NYSE", thesisTagZh: "公用事业与可再生能源", themeKey: "power_grid", themeLabelZh: "电力/电网" },
  { symbol: "PWR", market: "US", assetClass: "EQUITY", name: "Quanta Services", currency: "USD", exchange: "NYSE", thesisTagZh: "电网工程建设", themeKey: "power_grid", themeLabelZh: "电力/电网" },
  { symbol: "HUBB", market: "US", assetClass: "EQUITY", name: "Hubbell", currency: "USD", exchange: "NYSE", thesisTagZh: "电气设备与电网组件", themeKey: "power_grid", themeLabelZh: "电力/电网" },
  { symbol: "POWL", market: "US", assetClass: "EQUITY", name: "Powell Industries", currency: "USD", exchange: "NASDAQ", thesisTagZh: "配电与电气装备", themeKey: "power_grid", themeLabelZh: "电力/电网" },
  { symbol: "AMZN", market: "US", assetClass: "EQUITY", name: "Amazon", currency: "USD", exchange: "NASDAQ", thesisTagZh: "电商与云协同" },
  { symbol: "GOOGL", market: "US", assetClass: "EQUITY", name: "Alphabet", currency: "USD", exchange: "NASDAQ", thesisTagZh: "广告与AI平台" },
  { symbol: "META", market: "US", assetClass: "EQUITY", name: "Meta", currency: "USD", exchange: "NASDAQ", thesisTagZh: "社交与广告效率" },
  { symbol: "NOW", market: "US", assetClass: "EQUITY", name: "ServiceNow", currency: "USD", exchange: "NYSE", thesisTagZh: "企业AI工作流", themeKey: "ai_software", themeLabelZh: "AI应用软件" },
  { symbol: "CRM", market: "US", assetClass: "EQUITY", name: "Salesforce", currency: "USD", exchange: "NYSE", thesisTagZh: "企业软件AI化", themeKey: "ai_software", themeLabelZh: "AI应用软件" },
  { symbol: "PLTR", market: "US", assetClass: "EQUITY", name: "Palantir", currency: "USD", exchange: "NASDAQ", thesisTagZh: "AI数据决策平台", themeKey: "ai_software", themeLabelZh: "AI应用软件" },
  { symbol: "SNOW", market: "US", assetClass: "EQUITY", name: "Snowflake", currency: "USD", exchange: "NYSE", thesisTagZh: "数据云与AI应用", themeKey: "ai_software", themeLabelZh: "AI应用软件" },
  { symbol: "DDOG", market: "US", assetClass: "EQUITY", name: "Datadog", currency: "USD", exchange: "NASDAQ", thesisTagZh: "云监控与AI运维", themeKey: "ai_software", themeLabelZh: "AI应用软件" },
  { symbol: "MDB", market: "US", assetClass: "EQUITY", name: "MongoDB", currency: "USD", exchange: "NASDAQ", thesisTagZh: "开发者数据平台", themeKey: "ai_software", themeLabelZh: "AI应用软件" },
  { symbol: "CRWD", market: "US", assetClass: "EQUITY", name: "CrowdStrike", currency: "USD", exchange: "NASDAQ", thesisTagZh: "终端安全平台", themeKey: "cybersecurity", themeLabelZh: "网络安全" },
  { symbol: "PANW", market: "US", assetClass: "EQUITY", name: "Palo Alto Networks", currency: "USD", exchange: "NASDAQ", thesisTagZh: "平台化网络安全", themeKey: "cybersecurity", themeLabelZh: "网络安全" },
  { symbol: "ZS", market: "US", assetClass: "EQUITY", name: "Zscaler", currency: "USD", exchange: "NASDAQ", thesisTagZh: "零信任安全", themeKey: "cybersecurity", themeLabelZh: "网络安全" },
  { symbol: "NET", market: "US", assetClass: "EQUITY", name: "Cloudflare", currency: "USD", exchange: "NYSE", thesisTagZh: "边缘网络与安全", themeKey: "cybersecurity", themeLabelZh: "网络安全" },
  { symbol: "FTNT", market: "US", assetClass: "EQUITY", name: "Fortinet", currency: "USD", exchange: "NASDAQ", thesisTagZh: "网络安全设备", themeKey: "cybersecurity", themeLabelZh: "网络安全" },
  { symbol: "OKTA", market: "US", assetClass: "EQUITY", name: "Okta", currency: "USD", exchange: "NASDAQ", thesisTagZh: "身份安全", themeKey: "cybersecurity", themeLabelZh: "网络安全" },
  { symbol: "ISRG", market: "US", assetClass: "EQUITY", name: "Intuitive Surgical", currency: "USD", exchange: "NASDAQ", thesisTagZh: "手术机器人", themeKey: "robotics", themeLabelZh: "机器人/自动化" },
  { symbol: "TER", market: "US", assetClass: "EQUITY", name: "Teradyne", currency: "USD", exchange: "NASDAQ", thesisTagZh: "测试设备与协作机器人", themeKey: "robotics", themeLabelZh: "机器人/自动化" },
  { symbol: "SYM", market: "US", assetClass: "EQUITY", name: "Symbotic", currency: "USD", exchange: "NASDAQ", thesisTagZh: "仓储自动化", themeKey: "robotics", themeLabelZh: "机器人/自动化" },
  { symbol: "ROK", market: "US", assetClass: "EQUITY", name: "Rockwell Automation", currency: "USD", exchange: "NYSE", thesisTagZh: "工业自动化", themeKey: "robotics", themeLabelZh: "机器人/自动化" },
  { symbol: "ABBNY", market: "US", assetClass: "EQUITY", name: "ABB", currency: "USD", exchange: "OTC", thesisTagZh: "工业机器人与电气化", themeKey: "robotics", themeLabelZh: "机器人/自动化" },
  { symbol: "FANUY", market: "US", assetClass: "EQUITY", name: "Fanuc", currency: "USD", exchange: "OTC", thesisTagZh: "工业机器人龙头", themeKey: "robotics", themeLabelZh: "机器人/自动化" },
  { symbol: "TSLA", market: "US", assetClass: "EQUITY", name: "Tesla", currency: "USD", exchange: "NASDAQ", thesisTagZh: "电动车与储能" },
  { symbol: "BRK-B", market: "US", assetClass: "EQUITY", name: "Berkshire Hathaway", currency: "USD", exchange: "NYSE", thesisTagZh: "多元化价值配置" },

  { symbol: "0700.HK", market: "HK", assetClass: "EQUITY", name: "腾讯控股", currency: "HKD", exchange: "HKEX", thesisTagZh: "平台生态护城河" },
  { symbol: "9988.HK", market: "HK", assetClass: "EQUITY", name: "阿里巴巴-SW", currency: "HKD", exchange: "HKEX", thesisTagZh: "电商与云重估" },
  { symbol: "3690.HK", market: "HK", assetClass: "EQUITY", name: "美团-W", currency: "HKD", exchange: "HKEX", thesisTagZh: "本地生活渗透" },
  { symbol: "1299.HK", market: "HK", assetClass: "EQUITY", name: "友邦保险", currency: "HKD", exchange: "HKEX", thesisTagZh: "保险现金流稳健" },
  { symbol: "2318.HK", market: "HK", assetClass: "EQUITY", name: "中国平安", currency: "HKD", exchange: "HKEX", thesisTagZh: "保险与金融协同" },
  { symbol: "1810.HK", market: "HK", assetClass: "EQUITY", name: "小米集团-W", currency: "HKD", exchange: "HKEX", thesisTagZh: "硬件生态扩张" },
  { symbol: "0388.HK", market: "HK", assetClass: "EQUITY", name: "香港交易所", currency: "HKD", exchange: "HKEX", thesisTagZh: "交易基础设施" },
  { symbol: "0005.HK", market: "HK", assetClass: "EQUITY", name: "汇丰控股", currency: "HKD", exchange: "HKEX", thesisTagZh: "高分红金融股" },

  { symbol: "600519.SS", market: "CN", assetClass: "EQUITY", name: "贵州茅台", currency: "CNY", exchange: "SSE", thesisTagZh: "白酒龙头现金流" },
  { symbol: "601318.SS", market: "CN", assetClass: "EQUITY", name: "中国平安", currency: "CNY", exchange: "SSE", thesisTagZh: "保险资产质量改善" },
  { symbol: "600036.SS", market: "CN", assetClass: "EQUITY", name: "招商银行", currency: "CNY", exchange: "SSE", thesisTagZh: "优质零售银行" },
  { symbol: "000333.SZ", market: "CN", assetClass: "EQUITY", name: "美的集团", currency: "CNY", exchange: "SZSE", thesisTagZh: "制造出海能力" },
  { symbol: "300750.SZ", market: "CN", assetClass: "EQUITY", name: "宁德时代", currency: "CNY", exchange: "SZSE", thesisTagZh: "动力电池龙头" },
  { symbol: "601899.SS", market: "CN", assetClass: "EQUITY", name: "紫金矿业", currency: "CNY", exchange: "SSE", thesisTagZh: "资源品周期弹性" },
  { symbol: "000651.SZ", market: "CN", assetClass: "EQUITY", name: "格力电器", currency: "CNY", exchange: "SZSE", thesisTagZh: "高股息家电" },
  { symbol: "601012.SS", market: "CN", assetClass: "EQUITY", name: "隆基绿能", currency: "CNY", exchange: "SSE", thesisTagZh: "新能源链核心" },

  { symbol: "005930.KS", market: "KR", assetClass: "EQUITY", name: "Samsung Electronics", currency: "KRW", exchange: "KRX", thesisTagZh: "存储与先进封装", themeKey: "memory_storage", themeLabelZh: "存储/内存" },
  { symbol: "000660.KS", market: "KR", assetClass: "EQUITY", name: "SK hynix", currency: "KRW", exchange: "KRX", thesisTagZh: "HBM内存龙头", themeKey: "memory_storage", themeLabelZh: "存储/内存" },

  { symbol: "SPY", market: "US", assetClass: "ETF", name: "SPDR S&P 500 ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "美股宽基核心" },
  { symbol: "QQQ", market: "US", assetClass: "ETF", name: "Invesco QQQ", currency: "USD", exchange: "NASDAQ", thesisTagZh: "纳指成长风格" },
  { symbol: "SMH", market: "US", assetClass: "ETF", name: "VanEck Semiconductor ETF", currency: "USD", exchange: "NASDAQ", thesisTagZh: "全球半导体篮子", themeKey: "semiconductor", themeLabelZh: "半导体" },
  { symbol: "SOXX", market: "US", assetClass: "ETF", name: "iShares Semiconductor ETF", currency: "USD", exchange: "NASDAQ", thesisTagZh: "美国半导体指数", themeKey: "semiconductor", themeLabelZh: "半导体" },
  { symbol: "BOTZ", market: "US", assetClass: "ETF", name: "Global X Robotics & Artificial Intelligence ETF", currency: "USD", exchange: "NASDAQ", thesisTagZh: "机器人与AI ETF", themeKey: "robotics", themeLabelZh: "机器人/自动化" },
  { symbol: "ROBO", market: "US", assetClass: "ETF", name: "ROBO Global Robotics and Automation ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "全球机器人自动化 ETF", themeKey: "robotics", themeLabelZh: "机器人/自动化" },
  { symbol: "CIBR", market: "US", assetClass: "ETF", name: "First Trust Nasdaq Cybersecurity ETF", currency: "USD", exchange: "NASDAQ", thesisTagZh: "网络安全 ETF", themeKey: "cybersecurity", themeLabelZh: "网络安全" },
  { symbol: "HACK", market: "US", assetClass: "ETF", name: "Amplify Cybersecurity ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "网络安全主题 ETF", themeKey: "cybersecurity", themeLabelZh: "网络安全" },
  { symbol: "IHAK", market: "US", assetClass: "ETF", name: "iShares Cybersecurity and Tech ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "安全科技 ETF", themeKey: "cybersecurity", themeLabelZh: "网络安全" },
  { symbol: "VTI", market: "US", assetClass: "ETF", name: "Vanguard Total Stock Market ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "全市场覆盖" },
  { symbol: "IWM", market: "US", assetClass: "ETF", name: "iShares Russell 2000 ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "小盘风格补充" },
  { symbol: "2800.HK", market: "HK", assetClass: "ETF", name: "盈富基金", currency: "HKD", exchange: "HKEX", thesisTagZh: "港股宽基代表" },
  { symbol: "2823.HK", market: "HK", assetClass: "ETF", name: "安硕A50中国", currency: "HKD", exchange: "HKEX", thesisTagZh: "A50大盘敞口" },
  { symbol: "510300.SS", market: "CN", assetClass: "ETF", name: "沪深300ETF", currency: "CNY", exchange: "SSE", thesisTagZh: "A股核心宽基" },
  { symbol: "159915.SZ", market: "CN", assetClass: "ETF", name: "创业板ETF", currency: "CNY", exchange: "SZSE", thesisTagZh: "成长风格增强" },
  { symbol: "EFA", market: "US", assetClass: "ETF", name: "iShares MSCI EAFE ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "发达市场ex-US", themeKey: "global_region", themeLabelZh: "全球区域" },
  { symbol: "EEM", market: "US", assetClass: "ETF", name: "iShares MSCI Emerging Markets ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "全球新兴市场", themeKey: "global_region", themeLabelZh: "全球区域" },
  { symbol: "INDA", market: "US", assetClass: "ETF", name: "iShares MSCI India ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "印度增长红利", themeKey: "global_region", themeLabelZh: "全球区域" },
  { symbol: "EPI", market: "US", assetClass: "ETF", name: "WisdomTree India Earnings Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "印度盈利因子", themeKey: "global_region", themeLabelZh: "全球区域" },
  { symbol: "EWJ", market: "US", assetClass: "ETF", name: "iShares MSCI Japan ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "日本股市代理", themeKey: "global_region", themeLabelZh: "全球区域" },
  { symbol: "DXJ", market: "US", assetClass: "ETF", name: "WisdomTree Japan Hedged Equity Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "日本汇率对冲股票", themeKey: "global_region", themeLabelZh: "全球区域" },
  { symbol: "EWY", market: "US", assetClass: "ETF", name: "iShares MSCI South Korea ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "韩国股票篮子", themeKey: "global_region", themeLabelZh: "全球区域" },
  { symbol: "FLTW", market: "US", assetClass: "ETF", name: "Franklin FTSE Taiwan ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "台湾股票篮子", themeKey: "global_region", themeLabelZh: "全球区域" },
  { symbol: "MCHI", market: "US", assetClass: "ETF", name: "iShares MSCI China ETF", currency: "USD", exchange: "NASDAQ", thesisTagZh: "中国股票篮子", themeKey: "china_core", themeLabelZh: "中国资产" },
  { symbol: "KWEB", market: "US", assetClass: "ETF", name: "KraneShares CSI China Internet ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "中国互联网科技", themeKey: "china_core", themeLabelZh: "中国资产" },
  { symbol: "VNQ", market: "US", assetClass: "ETF", name: "Vanguard Real Estate ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "美国REITs地产" },

  { symbol: "GLD", market: "US", assetClass: "COMMODITY", name: "SPDR Gold Shares", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "黄金现货代理" },
  { symbol: "IAU", market: "US", assetClass: "COMMODITY", name: "iShares Gold Trust", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "黄金低费率配置" },
  { symbol: "SLV", market: "US", assetClass: "COMMODITY", name: "iShares Silver Trust", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "白银波动弹性" },
  { symbol: "USO", market: "US", assetClass: "COMMODITY", name: "United States Oil Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "原油价格代理" },
  { symbol: "BNO", market: "US", assetClass: "COMMODITY", name: "United States Brent Oil Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "布油敞口补充" },
  { symbol: "DBC", market: "US", assetClass: "COMMODITY", name: "Invesco DB Commodity Index Tracking Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "综合商品指数" },
  { symbol: "DBA", market: "US", assetClass: "COMMODITY", name: "Invesco DB Agriculture Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "农业商品敞口" },

  { symbol: "BND", market: "US", assetClass: "BOND", name: "Vanguard Total Bond Market ETF", currency: "USD", exchange: "NASDAQ", thesisTagZh: "债券底仓配置" },
  { symbol: "TLT", market: "US", assetClass: "BOND", name: "iShares 20+ Year Treasury Bond ETF", currency: "USD", exchange: "NASDAQ", thesisTagZh: "久期弹性工具" },
  { symbol: "IEF", market: "US", assetClass: "BOND", name: "iShares 7-10 Year Treasury Bond ETF", currency: "USD", exchange: "NASDAQ", thesisTagZh: "中期国债稳健" },
  { symbol: "LQD", market: "US", assetClass: "BOND", name: "iShares iBoxx $ Investment Grade Corporate Bond ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "投资级信用债" },
  { symbol: "511010.SS", market: "CN", assetClass: "BOND", name: "国债ETF", currency: "CNY", exchange: "SSE", thesisTagZh: "利率债防守" },
  { symbol: "511260.SS", market: "CN", assetClass: "BOND", name: "十年国债ETF", currency: "CNY", exchange: "SSE", thesisTagZh: "中长端久期" },
  { symbol: "TIP", market: "US", assetClass: "BOND", name: "iShares TIPS Bond ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "通胀保护工具" },
  { symbol: "SGOV", market: "US", assetClass: "BOND", name: "iShares 0-3 Month Treasury Bond ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "超短债现金替代" },
  { symbol: "3141.HK", market: "HK", assetClass: "BOND", name: "安硕亚洲高息债券ETF", currency: "HKD", exchange: "HKEX", thesisTagZh: "亚洲债券收益" },
  { symbol: "2819.HK", market: "HK", assetClass: "BOND", name: "安硕美元债ETF", currency: "HKD", exchange: "HKEX", thesisTagZh: "美元债配置补充" },

  { symbol: "BTC-USD", market: "CRYPTO", assetClass: "CRYPTO", name: "Bitcoin", currency: "USD", exchange: "CRYPTO", thesisTagZh: "加密市场锚资产" },
  { symbol: "ETH-USD", market: "CRYPTO", assetClass: "CRYPTO", name: "Ethereum", currency: "USD", exchange: "CRYPTO", thesisTagZh: "智能合约核心" },
  { symbol: "SOL-USD", market: "CRYPTO", assetClass: "CRYPTO", name: "Solana", currency: "USD", exchange: "CRYPTO", thesisTagZh: "高性能公链" },

  { symbol: "UUP", market: "US", assetClass: "CURRENCY", name: "Invesco DB US Dollar Index Bullish Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "美元指数多头" },
  { symbol: "UDN", market: "US", assetClass: "CURRENCY", name: "Invesco DB US Dollar Index Bearish Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "美元指数空头" },
  { symbol: "FXE", market: "US", assetClass: "CURRENCY", name: "Invesco CurrencyShares Euro Trust", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "欧元敞口" },
  { symbol: "FXY", market: "US", assetClass: "CURRENCY", name: "Invesco CurrencyShares Japanese Yen Trust", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "日元避险敞口" },
  { symbol: "FXB", market: "US", assetClass: "CURRENCY", name: "Invesco CurrencyShares British Pound Trust", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "英镑敞口" },
  { symbol: "FXA", market: "US", assetClass: "CURRENCY", name: "Invesco CurrencyShares Australian Dollar Trust", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "澳元商品货币" },
  { symbol: "CYB", market: "US", assetClass: "CURRENCY", name: "WisdomTree Chinese Yuan Strategy Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "人民币汇率敞口" },
  { symbol: "CEW", market: "US", assetClass: "CURRENCY", name: "WisdomTree Emerging Currency Strategy Fund", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "新兴市场货币篮子" },
];
