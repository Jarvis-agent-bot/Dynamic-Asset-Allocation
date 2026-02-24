import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-wqat-evidence-panel-f0028-v0', () => {
  it('adds a W_qat explainability evidence trace panel', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('W_qat explainability evidence trace panel');
    expect(source).toContain('const wQatExplainabilityEvidenceReviewCount = wQatExplainabilityEvidenceTraceRows.filter((row) => row.evidenceStatus !== \'clear\').length;');
    expect(source).toContain('evidence status=<b>{row.evidenceStatus}</b>');
    expect(source).toContain("evidence trace verdict: review rows=<b>{wQatExplainabilityEvidenceReviewCount}/{wQatExplainabilityEvidenceTraceRows.length}</b> · mode=<b>{wQatExplainabilityEvidenceReviewCount > 0 ? 'wqat-explainability-evidence-review-required' : 'wqat-explainability-evidence-clear'}</b>");
  });
});
