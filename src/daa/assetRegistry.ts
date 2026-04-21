/**
 * 全局资产名称登记表 —— TG 推送 / Agent 日报 / UI 标签的唯一中文名源头。
 *
 * - 中港股：直接用 `featuredAssetsCatalog` 里的 `name`（已是中文）
 * - 美股 / 加密 / ETF / 大宗：这里维护一份中文名覆盖表（下方 US_NAME_ZH）
 * - 没有登记的 symbol 返回 null，调用方回退原 ticker
 *
 * 只提供 2 个 API：
 *   - `getAssetDisplayName(symbol)` → "英伟达" | null
 *   - `formatAssetLabel({ symbol, assetKey })` → "英伟达 NVDA"（有中文名则拼接，否则只显示 ticker）
 */

import { parseDaaAssetKey } from "./assetKey";
import { WORKBENCH_FEATURED_ASSETS_CATALOG_ } from "./modules/workbench/featuredAssetsCatalog";

/** 美股 / 加密 / 全球 ETF 等英文名资产的中文补充。ticker 全大写匹配。 */
const US_NAME_ZH: Record<string, string> = {
  // 美股股票
  AAPL: "苹果",
  MSFT: "微软",
  NVDA: "英伟达",
  AMZN: "亚马逊",
  GOOGL: "谷歌",
  META: "Meta",
  TSLA: "特斯拉",
  "BRK-B": "伯克希尔",

  // 宽基 / 主题 ETF
  SPY: "标普500 ETF",
  QQQ: "纳指100 ETF",
  VTI: "美国全市场 ETF",
  IWM: "罗素2000 ETF",
  EFA: "发达市场(除美) ETF",
  EEM: "新兴市场 ETF",
  INDA: "印度 ETF",
  EWJ: "日本 ETF",
  VNQ: "美国地产 REITs ETF",

  // 大宗商品
  GLD: "黄金 ETF (SPDR)",
  IAU: "黄金 ETF (iShares)",
  SLV: "白银 ETF",
  USO: "WTI 原油 ETF",
  BNO: "布伦特原油 ETF",
  DBC: "综合商品 ETF",
  DBA: "农产品 ETF",

  // 债券
  BND: "美债综合 ETF",
  TLT: "20年以上美债 ETF",
  IEF: "7-10年美债 ETF",
  LQD: "投资级公司债 ETF",
  TIP: "通胀保护债 ETF",
  SGOV: "超短美债 ETF",

  // 外汇
  UUP: "美元多头 ETF",
  UDN: "美元空头 ETF",
  FXE: "欧元 ETF",
  FXY: "日元 ETF",
  FXB: "英镑 ETF",
  FXA: "澳元 ETF",
  CYB: "人民币 ETF",
  CEW: "新兴市场货币 ETF",

  // 加密货币
  "BTC-USD": "比特币",
  "ETH-USD": "以太坊",
  "SOL-USD": "Solana",
};

function normSymbol(symbol: string): string {
  return (symbol || "").trim().toUpperCase();
}

/**
 * 一次性构建 symbol → 中文名映射。
 * catalog 已含中文名（HK/CN）的优先使用；其它（US/CRYPTO）走 US_NAME_ZH。
 */
const NAME_ZH_BY_SYMBOL: Map<string, string> = (() => {
  const map = new Map<string, string>();
  // HK / CN 资产：catalog.name 已是中文
  for (const item of WORKBENCH_FEATURED_ASSETS_CATALOG_) {
    const sym = normSymbol(item.symbol);
    if (item.market === "HK" || item.market === "CN") {
      map.set(sym, item.name);
    }
  }
  // US/CRYPTO：用 override 表
  for (const [sym, zh] of Object.entries(US_NAME_ZH)) {
    map.set(normSymbol(sym), zh);
  }
  return map;
})();

/** 根据 ticker 返回中文名；未登记返回 null。 */
export function getAssetDisplayName(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  return NAME_ZH_BY_SYMBOL.get(normSymbol(symbol)) ?? null;
}

/**
 * 统一的资产标签：有中文名 → "英伟达 NVDA"，没有 → "NVDA"。
 * 调用方可传 symbol 或 assetKey（`MARKET::SYMBOL`）。
 */
export function formatAssetLabel(input: { symbol?: string | null; assetKey?: string | null }): string {
  const symbol = input.symbol ?? (input.assetKey ? parseDaaAssetKey(input.assetKey)?.symbol ?? null : null);
  if (!symbol) return input.assetKey ?? "?";
  const zh = getAssetDisplayName(symbol);
  return zh ? `${zh} ${symbol}` : symbol;
}

/** 快捷 API：`MARKET::SYMBOL` → 带中文名的标签。 */
export function formatAssetLabelByKey(assetKey: string | null | undefined): string {
  if (!assetKey) return "?";
  return formatAssetLabel({ assetKey });
}
