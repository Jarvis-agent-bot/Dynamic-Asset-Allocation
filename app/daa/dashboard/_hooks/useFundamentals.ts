"use client";

import { useEffect, useRef, useState } from "react";

export type AssetFundamentals = {
  symbol: string;
  normalizedSymbol: string;
  marketCap: number | null;
  marketCapCurrency: string | null;
  trailingPE: number | null;
  pegRatio: number | null;
  pePercentile: number | null;
  pegPercentile: number | null;
  peSampleCount: number;
  pegSampleCount: number;
  peAsOfDate: string | null;
  pegAsOfDate: string | null;
  marketCapAsOfDate: string | null;
  source: string;
  updatedAt: string;
  issues: string[];
};

type FundamentalsResponse = {
  items?: Record<string, AssetFundamentals>;
};

function normalizeSymbol(symbol: string): string {
  return String(symbol || "").trim().toUpperCase();
}

export function useFundamentals(symbols: string[]): Record<string, AssetFundamentals> {
  const [data, setData] = useState<Record<string, AssetFundamentals>>({});
  const fetchedKey = useRef("");

  useEffect(() => {
    const filtered = symbols.map(normalizeSymbol).filter(Boolean);
    if (filtered.length === 0) {
      setData({});
      fetchedKey.current = "";
      return;
    }

    const key = [...new Set(filtered)].sort().join(",");
    if (key === fetchedKey.current) return;
    fetchedKey.current = key;

    const controller = new AbortController();
    const params = new URLSearchParams({ symbols: key });

    fetch(`/api/daa/market/yfinance/fundamentals?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const payload = json?.data as FundamentalsResponse | undefined;
        const items = payload?.items;
        if (items && typeof items === "object") setData(items);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [symbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return data;
}
