import { isDaaPgEnabledV0 } from "./pg/daaPgV0";

import * as sqlite from "./sqlite/daaSqliteStoreV0";
import * as pg from "./pg/daaStorePgV0";

export type {
  DaaRunAuditEventListRowV0,
  DaaRunAuditEventV0,
  DaaRunBundleV0,
  DaaRunListRowV0,
  DaaRunRowV0,
} from "./sqlite/daaSqliteStoreV0";

function usePg(): boolean {
  // Postgres is preferred when configured; sqlite remains as a local/dev fallback.
  return isDaaPgEnabledV0();
}

export async function createDaaRunV0(args: Parameters<typeof sqlite.createDaaRunV0>[0]) {
  return usePg() ? pg.createDaaRunV0(args) : sqlite.createDaaRunV0(args);
}

export async function setDaaRunPortfolioV0(args: Parameters<typeof sqlite.setDaaRunPortfolioV0>[0]) {
  return usePg() ? pg.setDaaRunPortfolioV0(args) : sqlite.setDaaRunPortfolioV0(args);
}

export async function setDaaRunConfirmV0(args: Parameters<typeof sqlite.setDaaRunConfirmV0>[0]) {
  return usePg() ? pg.setDaaRunConfirmV0(args) : sqlite.setDaaRunConfirmV0(args);
}

export async function setDaaRunExecutedV0(args: Parameters<typeof sqlite.setDaaRunExecutedV0>[0]) {
  return usePg() ? pg.setDaaRunExecutedV0(args) : sqlite.setDaaRunExecutedV0(args);
}

export async function appendDaaRunAuditEventV0(args: Parameters<typeof sqlite.appendDaaRunAuditEventV0>[0]) {
  return usePg() ? pg.appendDaaRunAuditEventV0(args) : sqlite.appendDaaRunAuditEventV0(args);
}

export async function getDaaRunBundleV0(runId: Parameters<typeof sqlite.getDaaRunBundleV0>[0]) {
  return usePg() ? pg.getDaaRunBundleV0(runId) : sqlite.getDaaRunBundleV0(runId);
}

export async function listDaaRunsV0(args: Parameters<typeof sqlite.listDaaRunsV0>[0]) {
  return usePg() ? pg.listDaaRunsV0(args) : sqlite.listDaaRunsV0(args);
}

export async function listDaaRunAuditEventsV0(args: Parameters<typeof sqlite.listDaaRunAuditEventsV0>[0]) {
  return usePg() ? pg.listDaaRunAuditEventsV0(args) : sqlite.listDaaRunAuditEventsV0(args);
}
