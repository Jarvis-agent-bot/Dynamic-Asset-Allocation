"use client";

import { useStrategyLabModelV1 } from "@/app/daa/dashboard/_hooks/useStrategyLabModelV1";
import {
  StrategyLabCandidateDetailPanelV1,
  StrategyLabDeepAnalysisPanelV1,
  StrategyLabEmptyStatePanelV1,
  StrategyLabRunOverviewPanelV1,
  StrategyLabSetupPanelV1,
} from "@/app/daa/dashboard/strategy-lab/_components/StrategyLabSectionsV1";

export default function StrategyLabPageClient() {
  const model = useStrategyLabModelV1();

  return (
    <div className="space-y-6 lg:space-y-7">
      <StrategyLabSetupPanelV1 model={model} />
      {model.result ? (
        <>
          <StrategyLabRunOverviewPanelV1 model={model} />
          <StrategyLabCandidateDetailPanelV1 model={model} />
          <StrategyLabDeepAnalysisPanelV1 model={model} />
        </>
      ) : (
        <StrategyLabEmptyStatePanelV1 model={model} />
      )}
    </div>
  );
}
