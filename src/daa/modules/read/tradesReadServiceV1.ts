import { listWorkbenchRebalanceReportsV1, listWorkbenchTradeRecordsV1 } from "@/src/daa/modules/workbench/workbenchReadServiceV1";

import type { TradesReadModelV1 } from "./readModelsV1";

export async function buildTradesReadModelV1(input: {
  tradeLimit?: number;
  reportLimit?: number;
} = {}): Promise<TradesReadModelV1> {
  const tradeLimit = Math.max(1, Math.min(500, Math.trunc(Number(input.tradeLimit) || 150)));
  const reportLimit = Math.max(1, Math.min(500, Math.trunc(Number(input.reportLimit) || 120)));
  const [records, reports] = await Promise.all([
    listWorkbenchTradeRecordsV1(tradeLimit),
    listWorkbenchRebalanceReportsV1(reportLimit),
  ]);
  return {
    records,
    reports,
    loadedAt: new Date().toISOString(),
  };
}
