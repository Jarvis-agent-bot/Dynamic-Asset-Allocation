import { requestDataV1 } from "@/src/daa/api/clientV1";

import type {
  AssetUniverseViewV1,
  ExecuteRebalanceCycleInputV1,
  ExecuteRebalanceCycleResultV1,
  GenerateRebalanceCycleInputV1,
  GenerateRebalanceCycleResultV1,
  PreTradeRiskCheckV1,
  RebalanceCycleV1,
  UpdateRebalanceCycleInputV1,
  WorkbenchAssetInsightResponseV1,
  WorkbenchBootstrapV1,
  WorkbenchExecutionExecuteInputV1,
  WorkbenchFeaturedAssetsResultV1,
  WorkbenchExecutionExecuteResultV1,
  WorkbenchMarketOrderPreviewResultV1,
  WorkbenchRebalanceConfigV1,
  WorkbenchRecommendationsResultV1,
  WorkbenchSearchAssetResultV1,
  WorkbenchTradeRecordsV1,
} from "./workbenchTypesV1";

export async function getWorkbenchBootstrapV1(): Promise<WorkbenchBootstrapV1> {
  return requestDataV1<WorkbenchBootstrapV1>("/api/daa/workbench/bootstrap", {
    method: "GET",
    cache: "no-store",
  });
}

export async function getWorkbenchRecommendationsV1(input: { analysisFocus: string }): Promise<WorkbenchRecommendationsResultV1> {
  return requestDataV1<WorkbenchRecommendationsResultV1>("/api/daa/workbench/recommendations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function previewWorkbenchExecutionV1(input: {
  assetKey: string;
  side: "BUY" | "SELL";
  qty?: number;
  notional?: number;
  feeRateBps?: number;
}): Promise<WorkbenchMarketOrderPreviewResultV1> {
  return requestDataV1<WorkbenchMarketOrderPreviewResultV1>("/api/daa/workbench/execution/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function executeWorkbenchOrderV1(input: WorkbenchExecutionExecuteInputV1): Promise<WorkbenchExecutionExecuteResultV1> {
  return requestDataV1<WorkbenchExecutionExecuteResultV1>("/api/daa/workbench/execution/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function searchWorkbenchAssetsV1(input: {
  q: string;
  market?: string;
  assetClass?: string;
  region?: string;
  limit?: number;
}): Promise<WorkbenchSearchAssetResultV1[]> {
  const qs = new URLSearchParams();
  qs.set("q", String(input.q || "").trim());
  if (input.market) qs.set("market", String(input.market).trim());
  if (input.assetClass) qs.set("assetClass", String(input.assetClass).trim());
  if (input.region) qs.set("region", String(input.region).trim());
  qs.set("limit", String(Math.max(1, Math.min(30, Math.trunc(input.limit ?? 10)))));
  const data = await requestDataV1<{ items: WorkbenchSearchAssetResultV1[] }>(`/api/daa/workbench/search-assets?${qs.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.items) ? data.items : [];
}

export async function listWorkbenchFeaturedAssetsV1(input: {
  market?: string;
  assetClass?: string;
  limitPerMarket?: number;
}): Promise<WorkbenchFeaturedAssetsResultV1> {
  const qs = new URLSearchParams();
  if (input.market) qs.set("market", String(input.market).trim());
  if (input.assetClass) qs.set("assetClass", String(input.assetClass).trim());
  qs.set("limitPerMarket", String(Math.max(1, Math.min(20, Math.trunc(input.limitPerMarket ?? 8)))));
  const data = await requestDataV1<WorkbenchFeaturedAssetsResultV1>(
    `/api/daa/workbench/featured-assets?${qs.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  return {
    groups: Array.isArray(data.groups) ? data.groups : [],
    generatedAt: String(data.generatedAt || ""),
  };
}

export async function upsertWorkbenchAssetV1(input: {
  symbol: string;
  market: string;
  currency?: string;
  assetClass?: string;
  region?: string;
  exchange?: string;
  instrumentType?: string;
  marketGroup?: string;
  watchEnabled?: boolean;
  watchTags?: string[];
  targetWeightHint?: number;
  notes?: string;
  lastPrice?: number;
}): Promise<AssetUniverseViewV1> {
  const data = await requestDataV1<{ row: AssetUniverseViewV1 }>("/api/daa/workbench/assets/upsert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.row;
}

export async function patchWorkbenchAssetV1(assetKey: string, input: {
  watchEnabled?: boolean;
  watchTags?: string[];
  targetWeightHint?: number;
  holdingQty?: number;
  holdingPrice?: number;
  costBasis?: number | null;
  notes?: string;
  assetClass?: string;
  region?: string;
  exchange?: string;
  instrumentType?: string;
  marketGroup?: string;
  lastPrice?: number;
}): Promise<AssetUniverseViewV1> {
  const encoded = encodeURIComponent(assetKey);
  const data = await requestDataV1<{ row: AssetUniverseViewV1 }>(`/api/daa/workbench/assets/${encoded}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.row;
}

export async function getWorkbenchAssetInsightsV1(assetKey: string, opts: {
  analysisFocus?: string;
  includeLlm?: boolean;
} = {}): Promise<WorkbenchAssetInsightResponseV1> {
  const qs = new URLSearchParams();
  if (opts.analysisFocus) qs.set("analysisFocus", opts.analysisFocus);
  if (opts.includeLlm != null) qs.set("includeLlm", opts.includeLlm ? "1" : "0");
  return requestDataV1<WorkbenchAssetInsightResponseV1>(`/api/daa/workbench/assets/${encodeURIComponent(assetKey)}/insights${qs.toString() ? `?${qs.toString()}` : ""}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function patchWorkbenchRebalanceConfigV1(input: Partial<WorkbenchRebalanceConfigV1>): Promise<WorkbenchRebalanceConfigV1> {
  return requestDataV1<WorkbenchRebalanceConfigV1>("/api/daa/workbench/rebalance-config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function generateWorkbenchRebalanceCycleV1(
  input: GenerateRebalanceCycleInputV1 = {},
): Promise<GenerateRebalanceCycleResultV1> {
  return requestDataV1<GenerateRebalanceCycleResultV1>("/api/daa/workbench/rebalance/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listWorkbenchRebalanceCyclesV1(limit = 120): Promise<RebalanceCycleV1[]> {
  const data = await requestDataV1<{ cycles: RebalanceCycleV1[] }>(
    `/api/daa/workbench/rebalance/cycles?limit=${Math.max(1, Math.min(500, Math.trunc(limit || 120)))}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  return Array.isArray(data.cycles) ? data.cycles : [];
}

export async function getWorkbenchRebalanceCycleV1(cycleId: string): Promise<RebalanceCycleV1> {
  return requestDataV1<RebalanceCycleV1>(`/api/daa/workbench/rebalance/cycles/${encodeURIComponent(cycleId)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function patchWorkbenchRebalanceCycleV1(
  cycleId: string,
  input: UpdateRebalanceCycleInputV1,
): Promise<RebalanceCycleV1> {
  return requestDataV1<RebalanceCycleV1>(`/api/daa/workbench/rebalance/cycles/${encodeURIComponent(cycleId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function executeWorkbenchRebalanceCycleV1(
  input: ExecuteRebalanceCycleInputV1,
): Promise<ExecuteRebalanceCycleResultV1> {
  return requestDataV1<ExecuteRebalanceCycleResultV1>("/api/daa/workbench/rebalance/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function runWorkbenchRiskCheckV1(input: {
  cycleId?: string;
  selectedSymbols?: string[];
} = {}): Promise<PreTradeRiskCheckV1> {
  return requestDataV1<PreTradeRiskCheckV1>("/api/daa/workbench/risk-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listWorkbenchTradeRecordsV1(limit = 120): Promise<WorkbenchTradeRecordsV1> {
  const [cycles, ordersData] = await Promise.all([
    listWorkbenchRebalanceCyclesV1(limit),
    requestDataV1<{ logs: WorkbenchTradeRecordsV1["orders"] }>(
      `/api/daa/workbench/execution/logs?limit=${Math.max(1, Math.min(500, Math.trunc(limit * 2 || 240)))}`,
      { method: "GET", cache: "no-store" },
    ),
  ]);
  return {
    cycles,
    orders: Array.isArray(ordersData.logs) ? ordersData.logs : [],
  };
}
