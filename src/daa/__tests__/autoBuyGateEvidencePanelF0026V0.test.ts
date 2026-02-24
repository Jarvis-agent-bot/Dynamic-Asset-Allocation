import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-buy-gate-evidence-panel-f0026-v0', () => {
  it('adds an evidence trace panel for buy gate prechecks', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('Buy gate evidence trace panel (precheck)');
    expect(source).toContain('const buyGateEvidenceReviewCount = buyGateEvidenceTraceRows.filter((row) => row.evidenceStatus !== \'clear\').length;');
    expect(source).toContain('evidence status=<b>{row.evidenceStatus}</b>');
    expect(source).toContain("evidence trace verdict: review rows=<b>{buyGateEvidenceReviewCount}/{buyGateEvidenceTraceRows.length}</b> · mode=<b>{buyGateEvidenceReviewCount > 0 ? 'buy-gate-evidence-review-required' : 'buy-gate-evidence-clear'}</b>");
  });
});
