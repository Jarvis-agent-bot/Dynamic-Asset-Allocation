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
  const [technicalSignalsBySymbol, setTechnicalSignalsBySymbol] = useState<Record<string, DaaTechnicalSignal>>({});
  const fetchedKey = useRef("");

  useEffect(() => {
    const filtered = symbols.map(normalizeSymbol).filter(Boolean);
    if (filtered.length === 0) {
      setTechnicalSignalsBySymbol({});
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
      .then((response) => (response.ok ? response.json() : null))
      .then((jsonPayload) => {
        const payload = jsonPayload?.data as TechnicalSignalsResponse | undefined;
        const items = payload?.items;
        if (!items || typeof items !== "object") return;
        const nextSignalsBySymbol: Record<string, DaaTechnicalSignal> = {};
        for (const [symbol, signal] of Object.entries(items)) {
          if (signal) nextSignalsBySymbol[normalizeSymbol(symbol)] = signal;
        }
        setTechnicalSignalsBySymbol(nextSignalsBySymbol);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [symbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return technicalSignalsBySymbol;
}
