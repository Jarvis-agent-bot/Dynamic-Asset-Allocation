import { describe, expect, it } from 'vitest';

import { renderDecisionCardsV0 } from './helpers/renderDecisionCardsV0';

describe('feature-scenario-routing-evidence-panel-v0', () => {
  it('shows scenario-routing evidence panel with gate statuses and trigger reasons', () => {
    const markup = renderDecisionCardsV0();

    expect(markup).toContain('Rebalance scenario A/B gates');
    expect(markup).toContain('Route execution by strong-hold vs value-trap decision gate.');
    expect(markup).toContain('Scenario-routing evidence: policy-gate=');
    expect(markup).toContain('data-quality-gate=');
    expect(markup).toContain('deep-negative-gate=');
    expect(markup).toContain('trigger reason:');
    expect(markup).toContain('Scenario routing evidence matrix (A/B gate snapshot)');
    expect(markup).toContain('policy-gate threshold(40):');
    expect(markup).toContain('deep-negative gate threshold(2):');
    expect(markup).toMatch(/data-quality gate threshold\(missing(?:>|&gt;)0\):/);
    expect(markup).toMatch(/data-quality gate threshold\(stale(?:>|&gt;)0\):/);
    expect(markup).toContain('Apply gate in rebalance orders');
  });
});
