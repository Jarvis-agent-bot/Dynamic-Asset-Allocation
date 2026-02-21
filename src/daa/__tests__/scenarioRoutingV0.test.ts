import { describe, expect, it } from 'vitest';

import {
  SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0,
  SCENARIO_ROUTING_FORCE_EXIT_DEEP_NEGATIVE_THRESHOLD_V0,
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
    expect(result.buyPathBlocked).toBe(false);
    expect(result.stressScoreThresholdUsed).toBe(SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0);
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
    expect(result.buyPathBlocked).toBe(true);
    expect(result.routeLabel).toBe('route to sell-only defensive rebalance (block buys)');
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
    expect(result.buyPathBlocked).toBe(true);
    expect(result.routeLabel).toBe('route to sell-only defensive rebalance (block buys)');
    expect(result.triggerReasons).toEqual(['deep-negative']);
  });

  it('selects force-exit path for severe value-trap pressure', () => {
    const result = deriveScenarioRoutingV0({
      highDriftCount: 0,
      deepNegativeCount: SCENARIO_ROUTING_FORCE_EXIT_DEEP_NEGATIVE_THRESHOLD_V0,
      missingPriceCount: 0,
      staleCloseCount: 0,
    });

    expect(result.scenario).toBe('B');
    expect(result.buyPathBlocked).toBe(true);
    expect(result.routeLabel).toBe('route to force-exit defensive rebalance');
    expect(result.triggerReasons).toEqual(['deep-negative']);
  });

  it('widens strong-hold stress threshold when quality/signal support is strong', () => {
    const result = deriveScenarioRoutingV0({
      highDriftCount: 6,
      deepNegativeCount: 0,
      missingPriceCount: 1,
      staleCloseCount: 0,
      qualitySupportScore: 0.9,
      signalSupportScore: 0.8,
    });

    expect(result.stressScore).toBeGreaterThanOrEqual(SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0);
    expect(result.stressScoreThresholdUsed).toBe(SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0 + 8);
    expect(result.scenario).toBe('A');
    expect(result.triggerReasons).toEqual([]);
  });

  it('keeps deep-negative route on scenario B even when strong-hold threshold widens', () => {
    const result = deriveScenarioRoutingV0({
      highDriftCount: 6,
      deepNegativeCount: SCENARIO_ROUTING_DEEP_NEGATIVE_THRESHOLD_V0,
      missingPriceCount: 1,
      staleCloseCount: 0,
      qualitySupportScore: 1,
      signalSupportScore: 1,
    });

    expect(result.stressScoreThresholdUsed).toBe(SCENARIO_ROUTING_STRESS_SCORE_THRESHOLD_V0 + 8);
    expect(result.scenario).toBe('B');
    expect(result.buyPathBlocked).toBe(true);
    expect(result.routeLabel).toBe('route to sell-only defensive rebalance (block buys)');
    expect(result.triggerReasons).toEqual(['deep-negative']);
  });
});
