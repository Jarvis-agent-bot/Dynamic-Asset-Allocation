import { requestData } from "@/src/daa/api/client";

import type {
  AssetUniverseView,
  ExecuteRebalanceCycleInput,
  ExecuteRebalanceCycleResult,
  ExecuteRebalanceSummary,
  GenerateRebalanceCycleInput,
  GenerateRebalanceCycleResult,
  PreTradeRiskCheck,
  RebalanceCycle,
  UpdateRebalanceCycleInput,
  WorkbenchExecutionExecuteInput,
  WorkbenchFeaturedAssetsResult,
  WorkbenchExecutionExecuteResult,
  WorkbenchMarketOrderPreviewResult,
  WorkbenchSearchAssetResult,
} from "./workbenchTypes";

export async function previewWorkbenchExecution(input: {
  assetKey: string;
  side: "BUY" | "SELL";
  qty?: number;
  notional?: number;
  feeRateBps?: number;
}): Promise<WorkbenchMarketOrderPreviewResult> {
  return requestData<WorkbenchMarketOrderPreviewResult>("/api/daa/workbench/execution/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function executeWorkbenchOrder(input: WorkbenchExecutionExecuteInput): Promise<WorkbenchExecutionExecuteResult> {
  return requestData<WorkbenchExecutionExecuteResult>("/api/daa/workbench/execution/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function searchWorkbenchAssets(input: {
  q: string;
  market?: string;
  assetClass?: string;
  region?: string;
  limit?: number;
}): Promise<WorkbenchSearchAssetResult[]> {
  const qs = new URLSearchParams();
  qs.set("q", String(input.q || "").trim());
  if (input.market) qs.set("market", String(input.market).trim());
  if (input.assetClass) qs.set("assetClass", String(input.assetClass).trim());
  if (input.region) qs.set("region", String(input.region).trim());
  qs.set("limit", String(Math.max(1, Math.min(30, Math.trunc(input.limit ?? 10)))));
  const data = await requestData<{ items: WorkbenchSearchAssetResult[] }>(`/api/daa/workbench/search-assets?${qs.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.items) ? data.items : [];
}

export async function listWorkbenchFeaturedAssets(input: {
  market?: string;
  assetClass?: string;
  theme?: string;
  limitPerMarket?: number;
}): Promise<WorkbenchFeaturedAssetsResult> {
  const qs = new URLSearchParams();
  if (input.market) qs.set("market", String(input.market).trim());
  if (input.assetClass) qs.set("assetClass", String(input.assetClass).trim());
  if (input.theme) qs.set("theme", String(input.theme).trim());
  qs.set("limitPerMarket", String(Math.max(1, Math.min(20, Math.trunc(input.limitPerMarket ?? 12)))));
  const data = await requestData<WorkbenchFeaturedAssetsResult>(
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

export async function upsertWorkbenchAsset(input: {
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
}): Promise<AssetUniverseView> {
  const data = await requestData<{ row: AssetUniverseView }>("/api/daa/workbench/assets/upsert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.row;
}

export async function patchWorkbenchAsset(assetKey: string, input: {
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
}): Promise<AssetUniverseView> {
  const encoded = encodeURIComponent(assetKey);
  const data = await requestData<{ row: AssetUniverseView }>(`/api/daa/workbench/assets/${encoded}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.row;
}

export async function generateWorkbenchRebalanceCycle(
  input: GenerateRebalanceCycleInput = {},
): Promise<GenerateRebalanceCycleResult> {
  return requestData<GenerateRebalanceCycleResult>("/api/daa/workbench/rebalance/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function patchWorkbenchRebalanceCycle(
  cycleId: string,
  input: UpdateRebalanceCycleInput,
): Promise<RebalanceCycle> {
  return requestData<RebalanceCycle>(`/api/daa/workbench/rebalance/cycles/${encodeURIComponent(cycleId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function executeWorkbenchRebalanceCycle(
  input: ExecuteRebalanceCycleInput,
): Promise<ExecuteRebalanceCycleResult> {
  return requestData<ExecuteRebalanceCycleResult>("/api/daa/workbench/rebalance/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function summarizeWorkbenchRebalanceExecution(
  input: ExecuteRebalanceCycleInput,
): Promise<ExecuteRebalanceSummary> {
  return requestData<ExecuteRebalanceSummary>("/api/daa/workbench/rebalance/execute-summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function runWorkbenchRiskCheck(input: {
  cycleId?: string;
  selectedAssetSideKeys?: string[];
} = {}): Promise<PreTradeRiskCheck> {
  return requestData<PreTradeRiskCheck>("/api/daa/workbench/risk-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
