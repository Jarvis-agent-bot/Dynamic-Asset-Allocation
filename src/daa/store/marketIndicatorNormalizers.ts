import type { DaaMarketIndicatorKey, DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";
import { MARKET_INDICATOR_KEYS_ } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import { normalizeText } from "@/src/daa/utils/normalize";

export function normalizeMarketIndicatorKey(value: unknown): DaaMarketIndicatorKey | null {
  const text = normalizeText(value, "").toLowerCase();
  return (MARKET_INDICATOR_KEYS_ as readonly string[]).includes(text) ? text as DaaMarketIndicatorKey : null;
}

export function normalizeMarketRegimeStore(value: unknown): DaaMarketRegime | "neutral" {
  const text = normalizeText(value, "neutral").toLowerCase();
  if (text === "risk_on") return "risk_on";
  if (text === "risk_off") return "risk_off";
  if (text === "transitional") return "transitional";
  return "neutral";
}
