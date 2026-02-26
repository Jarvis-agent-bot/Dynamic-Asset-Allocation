import { describe, expect, it } from 'vitest';

import { renderDecisionCardsV0 } from './helpers/renderDecisionCardsV0';

describe('feature-buy-gate-precheck-simulator-v5', () => {
  it('shows gate block score and readiness percentage in buy precheck rows', () => {
    const markup = renderDecisionCardsV0();

    expect(markup).toContain('gate block score=<b>');
    expect(markup).toContain('readiness=<b>');
    expect(markup).toMatch(/gate block score=<b>\d\.\d{2}<\/b> · readiness=<b>\d{1,3}%<\/b>/);
  });
});
