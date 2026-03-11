import { listDaaCashLedgerEntriesV1, listDaaEquitySnapshotsV1 } from "@/src/daa/store/daaStorePgV1";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchReadServiceV1";

import type { OverviewReadModelV1 } from "./readModelsV1";

export async function buildOverviewReadModelV1(): Promise<OverviewReadModelV1> {
  const [bootstrap, snapshots, cashLedger] = await Promise.all([
    buildWorkbenchBootstrapV1({ syncPrices: false, autoRiskCycle: false }),
    listDaaEquitySnapshotsV1(120),
    listDaaCashLedgerEntriesV1(10),
  ]);

  return {
    bootstrap,
    snapshots,
    cashLedger,
    loadedAt: new Date().toISOString(),
  };
}
