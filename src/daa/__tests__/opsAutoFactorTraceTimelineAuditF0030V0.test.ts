import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-timeline-audit-f0030-v0', () => {
  it('adds a timeline verdict stage for factor-trace audit transparency', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const factorTraceTimelineVerdict = factorTraceEvidenceBlockedCount > 0 ? 'factor-trace-audit-review-required' : 'factor-trace-audit-clear';");
    expect(source).toContain('T4 audit verdict: blocked-or-review rows=<b>{factorTraceEvidenceBlockedCount}/{factorTraceEvidenceRows.length}</b> · mode=<b>{factorTraceTimelineVerdict}</b>');
  });
});
