import { listWorkbenchRebalanceReports, listWorkbenchTradeRecords } from "@/src/daa/modules/workbench/workbenchReadService";

import type { TradesReadModel } from "./readModels";

export async function buildTradesReadModel(input: {
  tradeLimit?: number;
  reportLimit?: number;
} = {}): Promise<TradesReadModel> {
  const tradeLimit = Math.max(1, Math.min(500, Math.trunc(Number(input.tradeLimit) || 150)));
  const reportLimit = Math.max(1, Math.min(500, Math.trunc(Number(input.reportLimit) || 120)));
  const [records, reports] = await Promise.all([
    listWorkbenchTradeRecords(tradeLimit),
    listWorkbenchRebalanceReports(reportLimit),
  ]);
  return {
    records,
    reports,
    loadedAt: new Date().toISOString(),
  };
}
