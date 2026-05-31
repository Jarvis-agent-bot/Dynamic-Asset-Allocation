import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { buildWorkbenchBootstrapBundle } from "@/src/daa/modules/workbench/workbenchReadService";
import StrategyLabPageClient from "./_components/StrategyLabPageClient";
import { buildStrategyLabDateDefaults } from "./_components/strategyLabDateDefaults";
import { buildStrategyLabInitialData } from "./_components/strategyLabInitialData";

export const dynamic = "force-dynamic";

export default async function StrategyLabPage() {
  const dateDefaults = buildStrategyLabDateDefaults();
  let initialData = null;

  try {
    const { bootstrap } = await buildWorkbenchBootstrapBundle({
      syncPrices: false,
      autoRiskCycle: false,
    });
    initialData = buildStrategyLabInitialData({
      assets: bootstrap.assetUniverse,
      baseCurrency: bootstrap.baseCurrency,
      minOrderNotional: bootstrap.execution.minNotional ?? 50,
    });
  } catch (err) {
    logSwallowed("strategyLab.page.initialData", err);
  }

  return <StrategyLabPageClient dateDefaults={dateDefaults} initialData={initialData} />;
}
