import { describe, expect, it } from 'vitest';

import {
  SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0,
  SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0,
  deriveScenarioRoutingV0,
} from '../scenarioRoutingV0';

describe('mainline-dod-shows-decision-maint-refactor-cb29a7-v0', () => {
  it('routes to scenario A when no threshold is triggered', () => {
    const result = deriveScenarioRoutingV0({
      highDriftCount: 2,
      deepNegativeCount: SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0 - 1,
      missingPriceCount: 1,
      staleCloseCount: 2,
    });

    expect(result.scenario).toBe('A');
    expect(result.gateLabel).toBe('strong-hold gate');
    expect(result.routeLabel).toBe('route to normal rebalance execution');
    expect(result.triggerReasons).toEqual([]);
  });

  it('routes to scenario B with stress-score trigger and exposes reason', () => {
    const result = deriveScenarioRoutingV0({
      highDriftCount: 5,
      deepNegativeCount: 0,
      missingPriceCount: 2,
      staleCloseCount: 0,
    });

    expect(result.stressScore).toBeGreaterThanOrEqual(SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0);
    expect(result.scenario).toBe('B');
    expect(result.triggerReasons).toEqual(['stress-score']);
  });

  it('routes to scenario B with deep-negative trigger and exposes reason', () => {
    const result = deriveScenarioRoutingV0({
      highDriftCount: 1,
      deepNegativeCount: SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0,
      missingPriceCount: 0,
      staleCloseCount: 0,
    });

    expect(result.stressScore).toBeLessThan(SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0);
    expect(result.scenario).toBe('B');
    expect(result.triggerReasons).toEqual(['deep-negative']);
  });
});
