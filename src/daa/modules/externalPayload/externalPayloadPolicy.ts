import { normalizeText } from "@/src/daa/utils/normalize";

export const EXTERNAL_PAYLOAD_DEFAULT_RAW_RETENTION_DAYS = 90;
export const EXTERNAL_PAYLOAD_LATEST_PRICE_RAW_RETENTION_DAYS = 14;
export const EXTERNAL_PAYLOAD_FUNDAMENTALS_RAW_RETENTION_DAYS = 30;

function clampRetentionDays(value: unknown, fallback = EXTERNAL_PAYLOAD_DEFAULT_RAW_RETENTION_DAYS): number {
  const n = Math.trunc(Number(value));
  const days = Number.isFinite(n) ? n : fallback;
  return Math.max(7, Math.min(365, days));
}

export function resolveExternalPayloadRawRetentionDays(input: {
  provider: string;
  resource: string;
  requestedDays?: number;
}): number {
  const requestedDays = clampRetentionDays(input.requestedDays);
  const provider = normalizeText(input.provider).toLowerCase();
  const resource = normalizeText(input.resource).toLowerCase();

  if (provider === "yfinance" && resource === "yfinance.chart.latest") {
    return Math.min(requestedDays, EXTERNAL_PAYLOAD_LATEST_PRICE_RAW_RETENTION_DAYS);
  }

  if (provider === "yfinance" && resource === "fundamentals_yahoo_valuation_v4") {
    return Math.min(requestedDays, EXTERNAL_PAYLOAD_FUNDAMENTALS_RAW_RETENTION_DAYS);
  }

  return requestedDays;
}
