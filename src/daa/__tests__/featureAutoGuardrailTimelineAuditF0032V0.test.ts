import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-timeline-audit-f0032-v0', () => {
  it('adds guardrail decision flow timeline evidence review stage', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const guardrailDecisionFlowTimelineVerdict = guardrailDecisionFlowBlocked ? 'blocked-by-guardrails' : 'clear-for-preflight';");
    expect(source).toContain("const guardrailTimelineReviewMode = guardrailEvidenceReviewCount > 0 ? 'guardrail-timeline-review-required' : 'guardrail-timeline-clear';");
    expect(source).toContain('T4 evidence review: rows=<b>{guardrailEvidenceReviewCount}/{guardrailEvidenceTraceRows.length}</b> · mode=<b>{guardrailTimelineReviewMode}</b>');
    expect(source).toContain('timeline verdict: <b>{guardrailDecisionFlowTimelineVerdict}</b>');
  });
});
