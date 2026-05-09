import type { DaaMarketIndicatorKey, DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";
import { normalizeText } from "@/src/daa/utils/normalize";

export function normalizeMarketIndicatorKey(value: unknown): DaaMarketIndicatorKey | null {
  const text = normalizeText(value, "").toLowerCase();
  if (text === "vix") return "vix";
  if (text === "qqq_spy_ratio") return "qqq_spy_ratio";
  if (text === "fxi_volatility") return "fxi_volatility";
  if (text === "kweb_fxi_ratio") return "kweb_fxi_ratio";
  if (text === "btc_eth_ratio") return "btc_eth_ratio";
  if (text === "btc_volatility") return "btc_volatility";
  if (text === "gold_silver_ratio") return "gold_silver_ratio";
  return null;
}

export function normalizeMarketRegimeStore(value: unknown): DaaMarketRegime | "neutral" {
  const text = normalizeText(value, "neutral").toLowerCase();
  if (text === "risk_on") return "risk_on";
  if (text === "risk_off") return "risk_off";
  if (text === "transitional") return "transitional";
  return "neutral";
}
