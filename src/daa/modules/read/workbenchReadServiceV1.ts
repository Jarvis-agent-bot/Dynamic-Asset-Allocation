import { buildWorkbenchBootstrapV1, listWorkbenchRebalanceCyclesV1 } from "@/src/daa/modules/workbench/workbenchReadServiceV1";

import type { WorkbenchReadModelV1 } from "./readModelsV1";

export async function buildWorkbenchReadModelV1(input: {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}): Promise<WorkbenchReadModelV1> {
  const [bootstrap, cycles] = await Promise.all([
    buildWorkbenchBootstrapV1({
      syncPrices: input.syncPrices ?? false,
      autoRiskCycle: input.autoRiskCycle ?? false,
    }),
    listWorkbenchRebalanceCyclesV1(40),
  ]);
  return {
    bootstrap,
    cycles,
    loadedAt: new Date().toISOString(),
  };
}
