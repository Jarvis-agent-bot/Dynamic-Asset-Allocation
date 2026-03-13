import { listDaaCashLedgerEntries, listDaaEquitySnapshots } from "@/src/daa/store/daaStorePg";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";

import type { OverviewReadModel } from "./readModels";

export async function buildOverviewReadModel(): Promise<OverviewReadModel> {
  const [bootstrap, snapshots, cashLedger] = await Promise.all([
    buildWorkbenchBootstrap({ syncPrices: false, autoRiskCycle: false }),
    listDaaEquitySnapshots(120),
    listDaaCashLedgerEntries(10),
  ]);

  return {
    bootstrap,
    snapshots,
    cashLedger,
    loadedAt: new Date().toISOString(),
  };
}
