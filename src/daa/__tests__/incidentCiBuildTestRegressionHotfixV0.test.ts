import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('incident-ci-build-test-regression-hotfix-v0', () => {
  it('keeps timeline verdict expressions inline for legacy contract tests', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("timeline verdict: <b>{avgNetMultiplier < 0.8 ? 'requires-formula-review' : 'formula-ready-for-routing'}</b>");
    expect(source).toContain("timeline verdict: <b>{guardrailDecisionFlowBlocked ? 'blocked-by-guardrails' : 'clear-for-preflight'}</b>");
    expect(source).toContain("timeline verdict: <b>{manualCheckpointConfirmed ? 'checkpoint-cleared-for-execution-review' : 'awaiting-manual-confirmation'}</b>");
    expect(source).toContain('data-quality gate threshold(missing>0):');
    expect(source).toContain('data-quality gate threshold(stale>0):');
  });
});
