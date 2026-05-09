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
