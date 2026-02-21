import { describe, expect, it } from 'vitest';

import {
  SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0,
  SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0,
  deriveScenarioRoutingV0,
} from '../scenarioRoutingV0';

describe('mainline-dod-scenario-routing-is-explicit-and-testable-v0', () => {
  it('routes to scenario A when no gate threshold is hit', () => {
    const result = deriveScenarioRoutingV0({
      highDriftCount: 2,
      deepNegativeCount: SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0 - 1,
      missingPriceCount: 1,
      staleCloseCount: 2,
    });

    expect(result.scenario).toBe('A');
    expect(result.gateLabel).toBe('strong-hold gate');
    expect(result.routeLabel).toBe('route to normal rebalance execution');
    expect(result.usesStressScoreGate).toBe(false);
    expect(result.usesDeepNegativeGate).toBe(false);
  });

  it('routes to scenario B when stress score threshold is met', () => {
    const result = deriveScenarioRoutingV0({
      highDriftCount: 5,
      deepNegativeCount: 0,
      missingPriceCount: 2,
      staleCloseCount: 0,
    });

    expect(result.stressScore).toBeGreaterThanOrEqual(SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0);
    expect(result.scenario).toBe('B');
    expect(result.gateLabel).toBe('value-trap gate');
    expect(result.routeLabel).toBe('route to defensive rebalance (trim/hedge first)');
    expect(result.usesStressScoreGate).toBe(true);
    expect(result.usesDeepNegativeGate).toBe(false);
  });

  it('routes to scenario B when deep-negative threshold is met even below stress score threshold', () => {
    const result = deriveScenarioRoutingV0({
      highDriftCount: 1,
      deepNegativeCount: SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0,
      missingPriceCount: 0,
      staleCloseCount: 0,
    });

    expect(result.stressScore).toBeLessThan(SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0);
    expect(result.scenario).toBe('B');
    expect(result.usesStressScoreGate).toBe(false);
    expect(result.usesDeepNegativeGate).toBe(true);
  });
});
