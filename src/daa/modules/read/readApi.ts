import { requestData } from "@/src/daa/api/client";

import type {
  AssetDetailReadModel,
  TradesReadModel,
  WorkbenchReadModel,
} from "./readModels";

function buildQueryString(params: Record<string, string | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    qs.set(key, value);
  }
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : "";
}

async function requestReadModel<T>(path: string, params: Record<string, string | null | undefined>): Promise<T> {
  return requestData<T>(`${path}${buildQueryString(params)}`, { method: "GET", cache: "no-store" });
}

export async function getWorkbenchReadModel(input: {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}): Promise<WorkbenchReadModel> {
  return requestReadModel<WorkbenchReadModel>("/api/daa/read/workbench", {
    syncPrices: input.syncPrices == null ? null : (input.syncPrices ? "1" : "0"),
    autoRiskCycle: input.autoRiskCycle == null ? null : (input.autoRiskCycle ? "1" : "0"),
  });
}

export async function getTradesReadModel(input: {
  tradeLimit?: number;
  reportLimit?: number;
  startDate?: string;
  endDate?: string;
  symbol?: string;
  side?: string;
  status?: string;
} = {}): Promise<TradesReadModel> {
  return requestReadModel<TradesReadModel>("/api/daa/read/trades", {
    tradeLimit: input.tradeLimit == null ? null : String(input.tradeLimit),
    reportLimit: input.reportLimit == null ? null : String(input.reportLimit),
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    symbol: input.symbol || null,
    side: input.side || null,
    status: input.status || null,
  });
}

export async function getAssetDetailReadModel(input: {
  assetKey: string;
  fresh?: boolean;
}): Promise<AssetDetailReadModel> {
  return requestReadModel<AssetDetailReadModel>("/api/daa/read/asset-detail", {
    assetKey: input.assetKey,
    fresh: input.fresh == null ? null : (input.fresh ? "1" : "0"),
  });
}
