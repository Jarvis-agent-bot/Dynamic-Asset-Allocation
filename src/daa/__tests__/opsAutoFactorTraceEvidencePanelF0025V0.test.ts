import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ops-auto-factor-trace-evidence-panel-f0025-v0', () => {
  it('adds a factor-trace transparency evidence panel with a review verdict', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('Factor-trace transparency evidence panel');
    expect(source).toContain('const factorTraceEvidenceBlockedCount = factorTraceEvidenceRows.filter((row) => row.evidenceStatus !== \'ready\').length;');
    expect(source).toContain('evidence status=<b>{row.evidenceStatus}</b>');
    expect(source).toContain("evidence verdict: blocked-or-review rows=<b>{factorTraceEvidenceBlockedCount}/{factorTraceEvidenceRows.length}</b> · mode=<b>{factorTraceEvidenceBlockedCount > 0 ? 'factor-trace-evidence-review-required' : 'factor-trace-evidence-clear'}</b>");
  });
});
