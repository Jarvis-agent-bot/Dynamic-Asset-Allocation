import type { StrategyLabRunResult } from "@/src/daa/modules/strategyLab/strategyLabTypes";

export type StrategyLabApplyMeta = {
  canApply: boolean;
  hasTargetWeights: boolean;
  isSingleStrategy: boolean;
  strategyKey: string | null;
};

export function resolveStrategyLabApplyMeta(
  result: StrategyLabRunResult | null | undefined,
  applying: boolean,
): StrategyLabApplyMeta {
  const hasTargetWeights = Boolean(result?.targetWeights && Object.keys(result.targetWeights).length > 0);
  const strategyCount = result?.strategyResults.length || result?.params.strategies.length || 0;
  const isSingleStrategy = strategyCount <= 1;
  const strategyKey = result?.primaryStrategy || result?.params.strategies[0] || null;

  return {
    canApply: hasTargetWeights && isSingleStrategy && !applying,
    hasTargetWeights,
    isSingleStrategy,
    strategyKey,
  };
}
