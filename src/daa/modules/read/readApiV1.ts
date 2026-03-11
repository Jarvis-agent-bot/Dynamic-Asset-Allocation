import { requestDataV1 } from "@/src/daa/api/clientV1";

import type {
  OverviewReadModelV1,
  StrategyLabSeedReadModelV1,
  TradesReadModelV1,
  WorkbenchReadModelV1,
} from "./readModelsV1";

export async function getOverviewReadModelV1(): Promise<OverviewReadModelV1> {
  return requestDataV1<OverviewReadModelV1>("/api/daa/read/overview", { method: "GET", cache: "no-store" });
}

export async function getWorkbenchReadModelV1(input: {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}): Promise<WorkbenchReadModelV1> {
  const qs = new URLSearchParams();
  if (input.syncPrices != null) qs.set("syncPrices", input.syncPrices ? "1" : "0");
  if (input.autoRiskCycle != null) qs.set("autoRiskCycle", input.autoRiskCycle ? "1" : "0");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestDataV1<WorkbenchReadModelV1>(`/api/daa/read/workbench${suffix}`, { method: "GET", cache: "no-store" });
}

export async function getTradesReadModelV1(input: {
  tradeLimit?: number;
  reportLimit?: number;
} = {}): Promise<TradesReadModelV1> {
  const qs = new URLSearchParams();
  if (input.tradeLimit != null) qs.set("tradeLimit", String(input.tradeLimit));
  if (input.reportLimit != null) qs.set("reportLimit", String(input.reportLimit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestDataV1<TradesReadModelV1>(`/api/daa/read/trades${suffix}`, { method: "GET", cache: "no-store" });
}

export async function getStrategyLabSeedReadModelV1(): Promise<StrategyLabSeedReadModelV1> {
  return requestDataV1<StrategyLabSeedReadModelV1>("/api/daa/read/strategy-lab-seed", { method: "GET", cache: "no-store" });
}
