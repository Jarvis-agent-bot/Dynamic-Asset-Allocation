import { requestData } from "@/src/daa/api/client";

import type { StrategyLabRunParams, StrategyLabRunResult, StrategyLabHistoryItem } from "./strategyLabTypes";

export async function runBacktest(params: StrategyLabRunParams): Promise<StrategyLabRunResult> {
  return requestData<StrategyLabRunResult>("/api/daa/strategy-lab/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function getBacktestHistory(limit?: number): Promise<StrategyLabHistoryItem[]> {
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(Math.max(1, Math.min(100, Math.trunc(limit)))));
  return requestData<StrategyLabHistoryItem[]>(
    `/api/daa/strategy-lab/history${qs.toString() ? `?${qs.toString()}` : ""}`,
    { method: "GET", cache: "no-store" },
  );
}
