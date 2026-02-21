export type ScenarioRoutingInputV0 = {
  highDriftCount: number;
  deepNegativeCount: number;
  missingPriceCount: number;
  staleCloseCount: number;
};

export type ScenarioRoutingDecisionV0 = {
  scenario: 'A' | 'B';
  gateLabel: 'strong-hold gate' | 'value-trap gate';
  routeLabel:
    | 'route to normal rebalance execution'
    | 'route to defensive rebalance (trim/hedge first)';
  stressScore: number;
  triggerReasons: Array<'stress-score' | 'deep-negative'>;
};

export const SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0 = 35;
export const SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0 = 3;

export function deriveScenarioRoutingV0(input: ScenarioRoutingInputV0): ScenarioRoutingDecisionV0 {
  const stressScore = input.highDriftCount * 5 + input.missingPriceCount * 8 + input.staleCloseCount * 3;
  const triggerReasons: Array<'stress-score' | 'deep-negative'> = [];

  if (stressScore >= SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0) triggerReasons.push('stress-score');
  if (input.deepNegativeCount >= SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0) triggerReasons.push('deep-negative');

  const scenario = triggerReasons.length ? 'B' : 'A';
  if (scenario === 'A') {
    return {
      scenario,
      gateLabel: 'strong-hold gate',
      routeLabel: 'route to normal rebalance execution',
      stressScore,
      triggerReasons,
    };
  }

  return {
    scenario,
    gateLabel: 'value-trap gate',
    routeLabel: 'route to defensive rebalance (trim/hedge first)',
    stressScore,
    triggerReasons,
  };
}
