"use client";

import { useMemo } from "react";

import { createMarketDataClient, type MarketDataClient } from "@/src/market/marketDataClient";

export function useMarketDataClient(): MarketDataClient {
  // The client is pure (just wraps fetch). Memoize so call-sites can depend on stable identity.
  return useMemo(() => createMarketDataClient(), []);
}
