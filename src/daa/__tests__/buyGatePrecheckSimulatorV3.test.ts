import { describe, expect, it } from 'vitest';

import { renderDecisionCardsV0 } from './helpers/renderDecisionCardsV0';

describe('feature-buy-gate-precheck-simulator-v3', () => {
  it('shows blocker severity in buy precheck rows', () => {
    const markup = renderDecisionCardsV0();

    expect(markup).toContain('severity=<b>');
    expect(markup).toMatch(/severity=<b>(critical|high|medium|none)<\/b>/);
  });
});
