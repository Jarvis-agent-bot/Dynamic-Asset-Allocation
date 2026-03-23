import { requestData } from "@/src/daa/api/client";

import type {
  TradesReadModel,
  WorkbenchReadModel,
} from "./readModels";

export async function getWorkbenchReadModel(input: {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}): Promise<WorkbenchReadModel> {
  const qs = new URLSearchParams();
  if (input.syncPrices != null) qs.set("syncPrices", input.syncPrices ? "1" : "0");
  if (input.autoRiskCycle != null) qs.set("autoRiskCycle", input.autoRiskCycle ? "1" : "0");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestData<WorkbenchReadModel>(`/api/daa/read/workbench${suffix}`, { method: "GET", cache: "no-store" });
}

export async function getTradesReadModel(input: {
  tradeLimit?: number;
  reportLimit?: number;
} = {}): Promise<TradesReadModel> {
  const qs = new URLSearchParams();
  if (input.tradeLimit != null) qs.set("tradeLimit", String(input.tradeLimit));
  if (input.reportLimit != null) qs.set("reportLimit", String(input.reportLimit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestData<TradesReadModel>(`/api/daa/read/trades${suffix}`, { method: "GET", cache: "no-store" });
}
