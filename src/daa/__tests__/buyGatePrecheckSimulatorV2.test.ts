import { describe, expect, it } from 'vitest';

import { renderDecisionCardsV0 } from './helpers/renderDecisionCardsV0';

describe('feature-buy-gate-precheck-simulator-v2', () => {
  it('shows deterministic primary blocker trace in buy precheck rows', () => {
    const markup = renderDecisionCardsV0();

    expect(markup).toContain('primary blocker=<b>');
    expect(markup).toMatch(/primary blocker=<b>(incompetence|maxIn|liquidity|T\+N)<\/b>/);
  });
});
