import { buildWorkbenchBootstrap, listWorkbenchRebalanceCycles } from "@/src/daa/modules/workbench/workbenchReadService";

import type { WorkbenchReadModel } from "./readModels";

export async function buildWorkbenchReadModel(input: {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}): Promise<WorkbenchReadModel> {
  const [bootstrap, cycles] = await Promise.all([
    buildWorkbenchBootstrap({
      syncPrices: input.syncPrices ?? false,
      autoRiskCycle: input.autoRiskCycle ?? false,
    }),
    listWorkbenchRebalanceCycles(40),
  ]);
  return {
    bootstrap,
    cycles,
    loadedAt: new Date().toISOString(),
  };
}
