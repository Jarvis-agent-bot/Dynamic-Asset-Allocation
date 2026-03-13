"use client";

import { useStrategyLabModel } from "@/app/daa/dashboard/_hooks/useStrategyLabModel";
import {
  StrategyLabCandidateDetailPanel,
  StrategyLabDeepAnalysisPanel,
  StrategyLabEmptyStatePanel,
  StrategyLabRunOverviewPanel,
  StrategyLabSetupPanel,
} from "@/app/daa/dashboard/strategy-lab/_components/StrategyLabSections";

export default function StrategyLabPageClient() {
  const model = useStrategyLabModel();

  return (
    <div className="space-y-6 lg:space-y-7">
      <StrategyLabSetupPanel model={model} />
      {model.result ? (
        <>
          <StrategyLabRunOverviewPanel model={model} />
          <StrategyLabCandidateDetailPanel model={model} />
          <StrategyLabDeepAnalysisPanel model={model} />
        </>
      ) : (
        <StrategyLabEmptyStatePanel model={model} />
      )}
    </div>
  );
}
