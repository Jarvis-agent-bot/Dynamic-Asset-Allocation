import { requestDataV1 } from "@/src/daa/api/clientV1";

import type {
  AssetUniverseViewV1,
  WorkbenchAssetInsightResponseV1,
  WorkbenchBootstrapV1,
  WorkbenchExecutionAddItemInputV1,
  WorkbenchExecutionAddItemResultV1,
  WorkbenchExecutionCommitResultV1,
  WorkbenchMarketOrderPreviewResultV1,
  WorkbenchRecommendationsResultV1,
  WorkbenchSearchAssetResultV1,
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

export async function addWorkbenchExecutionItemV1(input: WorkbenchExecutionAddItemInputV1): Promise<WorkbenchExecutionAddItemResultV1> {
  return requestDataV1<WorkbenchExecutionAddItemResultV1>("/api/daa/workbench/execution/items", {
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

export async function commitWorkbenchExecutionV1(): Promise<WorkbenchExecutionCommitResultV1> {
  return requestDataV1<WorkbenchExecutionCommitResultV1>("/api/daa/workbench/execution/commit", {
    method: "POST",
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
