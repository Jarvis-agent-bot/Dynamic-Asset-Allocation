import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-evidence-panel-f0022-v0', () => {
  it('adds readiness and route telemetry to guardrail-first evidence trace verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const guardrailEvidenceReadinessPct = guardrailEvidenceTraceRows.length');
    expect(source).toContain("const guardrailEvidenceRouteMode = guardrailEvidenceReviewCount === 0");
    expect(source).toContain("evidence trace verdict: review rows=<b>{guardrailEvidenceReviewCount}/{guardrailEvidenceTraceRows.length}</b> · mode=<b>{guardrailEvidenceReviewCount > 0 ? 'guardrail-evidence-review-required' : 'guardrail-evidence-clear'}</b> · readiness=<b>{guardrailEvidenceReadinessPct}%</b> · route=<b>{guardrailEvidenceRouteMode}</b>");
  });
});
