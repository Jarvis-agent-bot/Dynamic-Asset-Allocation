import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-manual-confirmation-evidence-panel-f0029-v0', () => {
  it('adds a manual confirmation checkpoint evidence trace panel', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('Manual confirmation checkpoint evidence trace panel');
    expect(source).toContain('const manualConfirmationEvidenceReviewCount = manualConfirmationEvidenceTraceRows.filter((row) => row.evidenceStatus !== \'clear\').length;');
    expect(source).toContain('evidence status=<b>{row.evidenceStatus}</b>');
    expect(source).toContain("evidence trace verdict: review rows=<b>{manualConfirmationEvidenceReviewCount}/{manualConfirmationEvidenceTraceRows.length}</b> · mode=<b>{manualConfirmationEvidenceReviewCount > 0 ? 'manual-confirmation-evidence-review-required' : 'manual-confirmation-evidence-clear'}</b>");
  });
});
