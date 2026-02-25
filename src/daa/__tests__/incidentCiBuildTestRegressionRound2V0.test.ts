import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('incident-ci-build-test-regression-round2-v0', () => {
  it('keeps timeline contracts compatible for both legacy and f003x assertions', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("timeline verdict: <b>{avgNetMultiplier < 0.8 ? 'requires-formula-review' : 'formula-ready-for-routing'}</b>");
    expect(source).toContain('timeline verdict: <b>{formulaTimelineVerdictMode}</b>');
    expect(source).toContain("timeline verdict: <b>{guardrailDecisionFlowBlocked ? 'blocked-by-guardrails' : 'clear-for-preflight'}</b>");
    expect(source).toContain('timeline verdict: <b>{guardrailDecisionFlowTimelineVerdict}</b>');
    expect(source).toContain("timeline verdict: <b>{manualCheckpointConfirmed ? 'checkpoint-cleared-for-execution-review' : 'awaiting-manual-confirmation'}</b>");
    expect(source).toContain('timeline verdict: <b>{manualTimelineVerdictMode}</b>');
  });
});
