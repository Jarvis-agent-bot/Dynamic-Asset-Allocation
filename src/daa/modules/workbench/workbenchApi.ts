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
  WorkbenchAssetInsightResponse,
  WorkbenchRebalanceCycleReport,
  WorkbenchExecutionExecuteInput,
  WorkbenchFeaturedAssetsResult,
  WorkbenchLlmFeedbackRow,
  WorkbenchLlmFeedbackScore,
  WorkbenchLlmFeedbackType,
  WorkbenchExecutionExecuteResult,
  WorkbenchMarketOrderPreviewResult,
  WorkbenchRebalanceConfig,
  WorkbenchRecommendationsResult,
  WorkbenchSearchAssetResult,
  WorkbenchTradeRecords,
} from "./workbenchTypes";

export async function getWorkbenchRecommendations(input: { analysisFocus: string }): Promise<WorkbenchRecommendationsResult> {
  return requestData<WorkbenchRecommendationsResult>("/api/daa/workbench/recommendations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

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
  limitPerMarket?: number;
}): Promise<WorkbenchFeaturedAssetsResult> {
  const qs = new URLSearchParams();
  if (input.market) qs.set("market", String(input.market).trim());
  if (input.assetClass) qs.set("assetClass", String(input.assetClass).trim());
  qs.set("limitPerMarket", String(Math.max(1, Math.min(20, Math.trunc(input.limitPerMarket ?? 8)))));
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

export async function getWorkbenchAssetInsights(assetKey: string, opts: {
  analysisFocus?: string;
  includeLlm?: boolean;
} = {}): Promise<WorkbenchAssetInsightResponse> {
  const qs = new URLSearchParams();
  if (opts.analysisFocus) qs.set("analysisFocus", opts.analysisFocus);
  if (opts.includeLlm != null) qs.set("includeLlm", opts.includeLlm ? "1" : "0");
  return requestData<WorkbenchAssetInsightResponse>(`/api/daa/workbench/assets/${encodeURIComponent(assetKey)}/insights${qs.toString() ? `?${qs.toString()}` : ""}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function patchWorkbenchRebalanceConfig(input: Partial<WorkbenchRebalanceConfig>): Promise<WorkbenchRebalanceConfig> {
  return requestData<WorkbenchRebalanceConfig>("/api/daa/workbench/rebalance-config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
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

export async function getWorkbenchRebalanceCycle(cycleId: string): Promise<RebalanceCycle> {
  return requestData<RebalanceCycle>(`/api/daa/workbench/rebalance/cycles/${encodeURIComponent(cycleId)}`, {
    method: "GET",
    cache: "no-store",
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

export async function getWorkbenchRebalanceCycleReport(cycleId: string): Promise<WorkbenchRebalanceCycleReport | null> {
  const payload = await requestData<{ report: WorkbenchRebalanceCycleReport | null }>(
    `/api/daa/workbench/rebalance/cycles/${encodeURIComponent(cycleId)}/report`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  return payload.report || null;
}

export async function submitWorkbenchLlmFeedback(input: {
  contextId: string;
  type: WorkbenchLlmFeedbackType;
  score: WorkbenchLlmFeedbackScore;
  comment?: string;
}): Promise<WorkbenchLlmFeedbackRow> {
  const payload = await requestData<{ row: WorkbenchLlmFeedbackRow }>("/api/daa/workbench/llm-feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return payload.row;
}

export async function runWorkbenchRiskCheck(input: {
  cycleId?: string;
  selectedSymbols?: string[];
} = {}): Promise<PreTradeRiskCheck> {
  return requestData<PreTradeRiskCheck>("/api/daa/workbench/risk-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

