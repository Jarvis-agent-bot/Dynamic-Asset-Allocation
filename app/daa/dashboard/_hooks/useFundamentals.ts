"use client";

import { useEffect, useRef, useState } from "react";

export type AssetFundamentals = {
  symbol: string;
  normalizedSymbol: string;
  marketCap: number | null;
  marketCapCurrency: string | null;
  marketCapSource?: "price_x_shares_outstanding" | "quote_summary_market_cap" | "fundamentals_timeseries_market_cap" | null;
  marketPrice?: number | null;
  marketPriceCurrency?: string | null;
  sharesOutstanding?: number | null;
  sharesSource?: "shares_outstanding" | "implied_shares_outstanding" | null;
  trailingPE: number | null;
  pbRatio?: number | null;
  dividendYieldPct?: number | null;
  revenueGrowthPct?: number | null;
  earningsGrowthPct?: number | null;
  grossMarginsPct?: number | null;
  operatingMarginsPct?: number | null;
  profitMarginsPct?: number | null;
  totalRevenue?: number | null;
  freeCashflow?: number | null;
  operatingCashflow?: number | null;
  totalCash?: number | null;
  totalDebt?: number | null;
  enterpriseValue?: number | null;
  sector?: string | null;
  sectorKey?: string | null;
  industry?: string | null;
  industryKey?: string | null;
  pePercentile: number | null;
  peSampleCount: number;
  peAsOfDate: string | null;
  peHistory?: FundamentalHistoryStats;
  peerGroupKey?: string | null;
  peerGroupLabel?: string | null;
  peerGroupBasis?: "industry" | "sector" | "curated_basket" | null;
  peerSymbols?: string[];
  peerMinSampleCount?: number;
  peerReason?: string | null;
  pePeerPercentile?: number | null;
  pePeerSampleCount?: number;
  pePeerMedian?: number | null;
  pbPeerPercentile?: number | null;
  pbPeerSampleCount?: number;
  pbPeerMedian?: number | null;
  marketCapAsOfDate: string | null;
  source: string;
  updatedAt: string;
  issues: string[];
};

export type FundamentalHistoryStats = {
  sampleCount: number;
  minSampleCount: number;
  spanDays: number | null;
  minSpanDays: number;
  percentile: number | null;
  latestRank: number | null;
  latestValue: number | null;
  min: number | null;
  median: number | null;
  max: number | null;
  firstAsOfDate: string | null;
  latestAsOfDate: string | null;
  eligible: boolean;
  reason: string | null;
};

type FundamentalsResponse = {
  items?: Record<string, AssetFundamentals>;
};

export type FundamentalsLoadState = {
  items: Record<string, AssetFundamentals>;
  loading: boolean;
  error: string | null;
  requestedCount: number;
  receivedCount: number;
};

function normalizeSymbol(symbol: string): string {
  return String(symbol || "").trim().toUpperCase();
}

export function useFundamentalsState(symbols: string[]): FundamentalsLoadState {
  const [state, setState] = useState<FundamentalsLoadState>({
    items: {},
    loading: false,
    error: null,
    requestedCount: 0,
    receivedCount: 0,
  });
  const fetchedKey = useRef("");

  useEffect(() => {
    const filtered = symbols.map(normalizeSymbol).filter(Boolean);
    if (filtered.length === 0) {
      setState({
        items: {},
        loading: false,
        error: null,
        requestedCount: 0,
        receivedCount: 0,
      });
      fetchedKey.current = "";
      return;
    }

    const key = [...new Set(filtered)].sort().join(",");
    if (key === fetchedKey.current) return;
    fetchedKey.current = key;

    const controller = new AbortController();
    const params = new URLSearchParams({ symbols: key });
    const requestedCount = key.split(",").filter(Boolean).length;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      requestedCount,
      receivedCount: 0,
    }));

    fetch(`/api/daa/market/yfinance/fundamentals?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`fundamentals request failed: ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const payload = json?.data as FundamentalsResponse | undefined;
        const items = payload?.items;
        const nextItems = items && typeof items === "object" ? items : {};
        setState({
          items: nextItems,
          loading: false,
          error: null,
          requestedCount,
          receivedCount: Object.keys(nextItems).length,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "fundamentals request failed",
          requestedCount,
        }));
      });

    return () => controller.abort();
  }, [symbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

export function useFundamentals(symbols: string[]): Record<string, AssetFundamentals> {
  return useFundamentalsState(symbols).items;
}
