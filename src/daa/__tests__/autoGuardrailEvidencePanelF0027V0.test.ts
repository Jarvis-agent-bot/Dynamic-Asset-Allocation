import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-guardrail-evidence-panel-f0027-v0', () => {
  it('adds an evidence trace panel for guardrail-first decision flow', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('Guardrail-first evidence trace panel');
    expect(source).toContain('const guardrailEvidenceReviewCount = guardrailEvidenceTraceRows.filter((row) => row.evidenceStatus !== \'clear\').length;');
    expect(source).toContain('evidence status=<b>{row.evidenceStatus}</b>');
    expect(source).toContain("evidence trace verdict: review rows=<b>{guardrailEvidenceReviewCount}/{guardrailEvidenceTraceRows.length}</b> · mode=<b>{guardrailEvidenceReviewCount > 0 ? 'guardrail-evidence-review-required' : 'guardrail-evidence-clear'}</b>");
  });
});
