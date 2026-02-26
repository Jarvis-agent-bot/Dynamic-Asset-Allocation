import { describe, expect, it } from 'vitest';

import { renderDecisionCardsV0 } from './helpers/renderDecisionCardsV0';

describe('incident-ci-build-test-regression-hotfix-v0', () => {
  it('keeps timeline verdicts and scenario quality-gate labels visible in rendered output', () => {
    const markup = renderDecisionCardsV0();

    expect(markup).toContain('timeline verdict: <b>formula-ready-for-routing</b>');
    expect(markup).toContain('timeline verdict: <b>blocked-by-guardrails</b>');
    expect(markup).toContain('timeline verdict: <b>awaiting-manual-confirmation</b>');
    expect(markup).toMatch(/data-quality gate threshold\(missing(?:>|&gt;)0\):/);
    expect(markup).toMatch(/data-quality gate threshold\(stale(?:>|&gt;)0\):/);
  });
});
