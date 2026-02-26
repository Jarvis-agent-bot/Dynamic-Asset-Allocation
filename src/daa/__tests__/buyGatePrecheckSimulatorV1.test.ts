import { describe, expect, it } from 'vitest';

import { renderDecisionCardsV0 } from './helpers/renderDecisionCardsV0';

describe('feature-buy-gate-precheck-simulator-v1', () => {
  it('shows blocked gate count summary in buy precheck verdicts', () => {
    const markup = renderDecisionCardsV0();

    expect(markup).toContain('Buy gate precheck simulator');
    expect(markup).toContain('blocked gates=<b>');
    expect(markup).toMatch(/blocked gates=<b>\d+<\/b>.*?(?:=>|=&gt;) <b>blocked<\/b>/);
  });
});
