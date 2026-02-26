import { describe, expect, it } from 'vitest';

import { renderDecisionCardsV0 } from './helpers/renderDecisionCardsV0';

describe('incident-ci-build-test-regression-round2-v0', () => {
  it('keeps all major timeline verdict contracts visible in rendered output', () => {
    const markup = renderDecisionCardsV0();

    expect(markup).toContain('timeline verdict: <b>formula-ready-for-routing</b>');
    expect(markup).toContain('timeline verdict: <b>blocked-by-guardrails</b>');
    expect(markup).toContain('timeline verdict: <b>awaiting-manual-confirmation</b>');
    expect(markup).toContain('W_qat formula explainability audit timeline');
    expect(markup).toContain('Guardrail-first decision flow audit timeline');
    expect(markup).toContain('Manual confirmation checkpoint audit timeline');
  });
});
