import { parseDaaAssetKey } from "@/src/daa/assetKey";

import {
  resolveMarketSessionStatus,
  type MarketSessionReasonCode,
} from "./marketSessionCalendar";

export type MarketSessionSnapshot = {
  market: string;
  isOpen: boolean;
  reasonCode: MarketSessionReasonCode;
  localDate: string;
  localTime: string;
  reasonZh: string;
};

function normalizeMarket(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

export function summarizeMarketSessionsForMarkets(input: {
  markets: Array<string | null | undefined>;
  now?: Date;
}): MarketSessionSnapshot[] {
  const seen = new Set<string>();
  const rows: MarketSessionSnapshot[] = [];
  for (const rawMarket of input.markets) {
    const market = normalizeMarket(rawMarket);
    if (!market || seen.has(market)) continue;
    seen.add(market);
    const status = resolveMarketSessionStatus({ market, now: input.now });
    rows.push({
      market: status.market,
      isOpen: status.isOpen,
      reasonCode: status.reasonCode,
      localDate: status.localDate,
      localTime: status.localTime,
      reasonZh: status.reasonZh,
    });
  }
  return rows;
}

export function summarizeMarketSessionsForAssetKeys(input: {
  assetKeys: Array<string | null | undefined>;
  now?: Date;
}): MarketSessionSnapshot[] {
  return summarizeMarketSessionsForMarkets({
    markets: input.assetKeys
      .map((assetKey) => parseDaaAssetKey(assetKey)?.market ?? null)
      .filter(Boolean),
    now: input.now,
  });
}
