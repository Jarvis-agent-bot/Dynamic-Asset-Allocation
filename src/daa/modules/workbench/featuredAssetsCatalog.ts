export type WorkbenchFeaturedMarket = "US" | "HK" | "CN" | "CRYPTO";
export type WorkbenchFeaturedAssetClass = "EQUITY" | "ETF" | "BOND" | "COMMODITY" | "CRYPTO";

export type WorkbenchFeaturedCatalogItem = {
  symbol: string;
  market: WorkbenchFeaturedMarket;
  assetClass: WorkbenchFeaturedAssetClass;
  name: string;
  currency: string;
  exchange: string;
  thesisTagZh: string;
};

export const WORKBENCH_FEATURED_ASSETS_CATALOG_: WorkbenchFeaturedCatalogItem[] = [
  { symbol: "AAPL", market: "US", assetClass: "EQUITY", name: "Apple", currency: "USD", exchange: "NASDAQ", thesisTagZh: "消费电子龙头" },
  { symbol: "MSFT", market: "US", assetClass: "EQUITY", name: "Microsoft", currency: "USD", exchange: "NASDAQ", thesisTagZh: "企业软件与云" },
  { symbol: "NVDA", market: "US", assetClass: "EQUITY", name: "NVIDIA", currency: "USD", exchange: "NASDAQ", thesisTagZh: "AI算力核心" },
  { symbol: "AMZN", market: "US", assetClass: "EQUITY", name: "Amazon", currency: "USD", exchange: "NASDAQ", thesisTagZh: "电商与云协同" },
  { symbol: "GOOGL", market: "US", assetClass: "EQUITY", name: "Alphabet", currency: "USD", exchange: "NASDAQ", thesisTagZh: "广告与AI平台" },
  { symbol: "META", market: "US", assetClass: "EQUITY", name: "Meta", currency: "USD", exchange: "NASDAQ", thesisTagZh: "社交与广告效率" },
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

  { symbol: "SPY", market: "US", assetClass: "ETF", name: "SPDR S&P 500 ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "美股宽基核心" },
  { symbol: "QQQ", market: "US", assetClass: "ETF", name: "Invesco QQQ", currency: "USD", exchange: "NASDAQ", thesisTagZh: "纳指成长风格" },
  { symbol: "VTI", market: "US", assetClass: "ETF", name: "Vanguard Total Stock Market ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "全市场覆盖" },
  { symbol: "IWM", market: "US", assetClass: "ETF", name: "iShares Russell 2000 ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "小盘风格补充" },
  { symbol: "2800.HK", market: "HK", assetClass: "ETF", name: "盈富基金", currency: "HKD", exchange: "HKEX", thesisTagZh: "港股宽基代表" },
  { symbol: "2823.HK", market: "HK", assetClass: "ETF", name: "安硕A50中国", currency: "HKD", exchange: "HKEX", thesisTagZh: "A50大盘敞口" },
  { symbol: "510300.SS", market: "CN", assetClass: "ETF", name: "沪深300ETF", currency: "CNY", exchange: "SSE", thesisTagZh: "A股核心宽基" },
  { symbol: "159915.SZ", market: "CN", assetClass: "ETF", name: "创业板ETF", currency: "CNY", exchange: "SZSE", thesisTagZh: "成长风格增强" },
  { symbol: "EFA", market: "US", assetClass: "ETF", name: "iShares MSCI EAFE ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "发达市场ex-US" },
  { symbol: "EEM", market: "US", assetClass: "ETF", name: "iShares MSCI Emerging Markets ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "全球新兴市场" },
  { symbol: "INDA", market: "US", assetClass: "ETF", name: "iShares MSCI India ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "印度增长红利" },
  { symbol: "EWJ", market: "US", assetClass: "ETF", name: "iShares MSCI Japan ETF", currency: "USD", exchange: "NYSE ARCA", thesisTagZh: "日本股市代理" },
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
];
