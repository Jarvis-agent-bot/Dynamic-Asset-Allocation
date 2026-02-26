import { describe, expect, it } from 'vitest';

import { renderDecisionCardsV0 } from './helpers/renderDecisionCardsV0';

describe('feature-rebalance-risk-envelope-visualizer-v0', () => {
  it('shows dynamic risk-envelope visualizer and per-symbol status', () => {
    const markup = renderDecisionCardsV0();

    expect(markup).toContain('Rebalance risk-envelope visualizer (dynamic decision bounds)');
    expect(markup).toMatch(/envelope=\[-?\d+\.\d%?, -?\d+\.\d%?\]/);
    expect(markup).toContain('outside-envelope');
    expect(markup).toContain('pressure tier=<b>');
  });
});
