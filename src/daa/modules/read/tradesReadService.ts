import { getDaaCurrentLedgerMeta, getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { listWorkbenchRebalanceReports, listWorkbenchTradeRecords } from "@/src/daa/modules/workbench/workbenchReadService";

import type { TradesReadModel } from "./readModels";

export async function buildTradesReadModel(input: {
  tradeLimit?: number;
  reportLimit?: number;
} = {}): Promise<TradesReadModel> {
  const tradeLimit = Math.max(1, Math.min(500, Math.trunc(Number(input.tradeLimit) || 150)));
  const reportLimit = Math.max(1, Math.min(500, Math.trunc(Number(input.reportLimit) || 120)));
  const [records, reports, ledgerMeta, system] = await Promise.all([
    listWorkbenchTradeRecords(tradeLimit),
    listWorkbenchRebalanceReports(reportLimit),
    getDaaCurrentLedgerMeta(),
    getDaaSystemConfig(),
  ]);
  return {
    baseCurrency: system.config.strategy.account.baseCurrency || "USD",
    records,
    reports,
    ledgerMeta,
    loadedAt: new Date().toISOString(),
  };
}
