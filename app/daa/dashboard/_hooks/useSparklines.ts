"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 批量获取 sparkline 数据的 hook。
 * 替代 per-row 的 N+1 请求模式，改为单次批量请求。
 *
 * @param symbols 需要 sparkline 的 symbol 列表（如 ["AAPL", "NVDA", "0388.HK"]）
 * @param days 天数（默认 30）
 * @returns Record<symbol, number[]>
 */
export function useSparklines(symbols: string[], days: number = 30): Record<string, number[]> {
  const [sparklineSeriesBySymbol, setSparklineSeriesBySymbol] = useState<Record<string, number[]>>({});
  const fetchedKey = useRef("");

  useEffect(() => {
    const filtered = symbols.filter(Boolean);
    if (filtered.length === 0) return;

    // 去重 + 排序生成稳定 key，避免重复请求
    const key = [...new Set(filtered)].sort().join(",");
    if (key === fetchedKey.current) return;
    fetchedKey.current = key;

    const params = new URLSearchParams({
      symbols: key,
      days: String(days),
    });

    fetch(`/api/daa/market/sparklines?${params}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const sparklines = json?.data?.sparklines ?? json?.sparklines ?? {};
        if (typeof sparklines === "object") setSparklineSeriesBySymbol(sparklines);
      })
      .catch(() => {});
  }, [symbols.join(","), days]); // eslint-disable-line react-hooks/exhaustive-deps

  return sparklineSeriesBySymbol;
}
