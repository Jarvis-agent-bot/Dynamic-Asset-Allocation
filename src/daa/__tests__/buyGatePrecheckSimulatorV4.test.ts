import { describe, expect, it } from 'vitest';

import { renderDecisionCardsV0 } from './helpers/renderDecisionCardsV0';

describe('feature-buy-gate-precheck-simulator-v4', () => {
  it('shows gate fingerprint snapshot in buy precheck rows', () => {
    const markup = renderDecisionCardsV0();

    expect(markup).toContain('fingerprint=<b>');
    expect(markup).toMatch(/fingerprint=<b>[IMLT-]{4}<\/b>/);
  });
});
