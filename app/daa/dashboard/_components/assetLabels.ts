/**
 * 共享的资产分类 label 工具函数
 * 从 AssetUniverseTable.tsx 提取，供多个组件复用
 */

export function assetClassLabel(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "EQUITY") return "股票";
  if (normalized === "ETF") return "ETF";
  if (normalized === "BOND") return "债券";
  if (normalized === "COMMODITY") return "商品";
  if (normalized === "CASH") return "现金";
  if (normalized === "CRYPTO") return "加密资产";
  if (normalized === "FUND") return "基金";
  if (normalized === "INDEX") return "指数";
  if (normalized === "OTHER") return "其他";
  return normalized || "未分类";
}

export function instrumentTypeLabel(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "STOCK") return "个股";
  if (normalized === "ETF") return "ETF";
  if (normalized === "BOND") return "债券";
  if (normalized === "COMMODITY") return "商品";
  if (normalized === "CASH") return "现金";
  if (normalized === "CRYPTO") return "加密资产";
  if (normalized === "FUND") return "基金";
  if (normalized === "INDEX") return "指数";
  if (normalized === "OTHER") return "其他类型";
  return normalized || "";
}

export function regionLabel(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "US") return "美股";
  if (normalized === "HK") return "港股";
  if (normalized === "CN") return "A股";
  if (normalized === "JP") return "日股";
  if (normalized === "EU") return "欧股";
  if (normalized === "CRYPTO" || normalized === "GLOBAL") return "全球";
  if (normalized === "OTHER") return "其他市场";
  return normalized || "未知市场";
}

export function exchangeLabel(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "HKEX") return "港交所";
  if (normalized === "SSE") return "上交所";
  if (normalized === "SZSE") return "深交所";
  if (normalized === "NASDAQ" || normalized === "NMS" || normalized === "NGM") return "纳斯达克";
  if (normalized === "NYSE" || normalized === "NYQ") return "纽交所";
  if (normalized === "NYSE ARCA" || normalized === "ARCA" || normalized === "PCX") return "纽交所 Arca";
  if (normalized === "CRYPTO") return "加密市场";
  return String(value || "").trim();
}

/** 根据 market + assetClass 推断持仓分类 tab key */
export function holdingCategoryKey(market: string, assetClass: string): string {
  const cls = String(assetClass || "").trim().toUpperCase();
  const mkt = String(market || "").trim().toUpperCase();

  if (cls === "CRYPTO") return "crypto";
  if (cls === "ETF") return "etf";
  if (cls === "BOND") return "bond";
  if (cls === "COMMODITY") return "commodity";
  if (cls === "EQUITY" || cls === "STOCK") {
    if (mkt === "US") return "us_equity";
    if (mkt === "HK") return "hk_equity";
    if (mkt === "CN") return "cn_equity";
    return "other_equity";
  }
  return "other";
}

export const HOLDING_CATEGORY_META: Array<{ key: string; label: string }> = [
  { key: "all", label: "全部" },
  { key: "us_equity", label: "美股" },
  { key: "hk_equity", label: "港股" },
  { key: "cn_equity", label: "A股" },
  { key: "crypto", label: "加密" },
  { key: "etf", label: "ETF" },
  { key: "bond", label: "债券" },
  { key: "commodity", label: "大宗商品" },
  { key: "other_equity", label: "其他股票" },
  { key: "other", label: "其他" },
];
