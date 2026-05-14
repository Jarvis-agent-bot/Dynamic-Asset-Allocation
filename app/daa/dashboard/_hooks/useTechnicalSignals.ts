"use client";

import { useEffect, useRef, useState } from "react";

import type { DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";

type TechnicalSignalsResponse = {
  items?: Record<string, DaaTechnicalSignal | null>;
};

function normalizeSymbol(symbol: string): string {
  return String(symbol || "").trim().toUpperCase();
}

export function useTechnicalSignals(symbols: string[]): Record<string, DaaTechnicalSignal> {
  const [data, setData] = useState<Record<string, DaaTechnicalSignal>>({});
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

    fetch(`/api/daa/signals/technical?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const payload = json?.data as TechnicalSignalsResponse | undefined;
        const items = payload?.items;
        if (!items || typeof items !== "object") return;
        const next: Record<string, DaaTechnicalSignal> = {};
        for (const [symbol, signal] of Object.entries(items)) {
          if (signal) next[normalizeSymbol(symbol)] = signal;
        }
        setData(next);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [symbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return data;
}
