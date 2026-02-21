export type ScenarioRoutingInputV0 = {
  highDriftCount: number;
  deepNegativeCount: number;
  missingPriceCount: number;
  staleCloseCount: number;
  qualitySupportScore?: number;
  signalSupportScore?: number;
};

export type ScenarioRoutingDecisionV0 = {
  scenario: 'A' | 'B';
  gateLabel: 'strong-hold gate' | 'value-trap gate';
  routeLabel:
    | 'route to normal rebalance execution'
    | 'route to defensive rebalance (trim/hedge first)';
  stressScore: number;
  stressScoreThresholdUsed: number;
  triggerReasons: Array<'stress-score' | 'deep-negative'>;
};

export const SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0 = 35;
export const SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0 = 3;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function deriveStressScoreThresholdV0(input: ScenarioRoutingInputV0): number {
  const quality = clamp01(input.qualitySupportScore ?? 0);
  const signal = clamp01(input.signalSupportScore ?? 0);
  const support = (quality + signal) / 2;

  if (support >= 0.7) return SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0 + 8;
  if (support >= 0.5) return SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0 + 4;
  return SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0;
}

export function deriveScenarioRoutingV0(input: ScenarioRoutingInputV0): ScenarioRoutingDecisionV0 {
  const stressScore = input.highDriftCount * 5 + input.missingPriceCount * 8 + input.staleCloseCount * 3;
  const stressScoreThresholdUsed = deriveStressScoreThresholdV0(input);
  const triggerReasons: Array<'stress-score' | 'deep-negative'> = [];

  if (stressScore >= stressScoreThresholdUsed) triggerReasons.push('stress-score');
  if (input.deepNegativeCount >= SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0) triggerReasons.push('deep-negative');

  const scenario = triggerReasons.length ? 'B' : 'A';
  if (scenario === 'A') {
    return {
      scenario,
      gateLabel: 'strong-hold gate',
      routeLabel: 'route to normal rebalance execution',
      stressScore,
      stressScoreThresholdUsed,
      triggerReasons,
    };
  }

  return {
    scenario,
    gateLabel: 'value-trap gate',
    routeLabel: 'route to defensive rebalance (trim/hedge first)',
    stressScore,
    stressScoreThresholdUsed,
    triggerReasons,
  };
}
