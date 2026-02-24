import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-timeline-audit-f0031-v0', () => {
  it('adds stage-by-stage buy gate precheck timeline verdict transparency', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const buyGateTimelineVerdict = buyGateEvidenceReviewCount > 0 ? 'buy-gate-precheck-review-required' : 'buy-gate-precheck-clear';");
    expect(source).toContain('T0 precheck snapshot: rows=<b>{precheckRows.length}</b> · ready rows=<b>{readyRows}</b>');
    expect(source).toContain('T4 timeline verdict: review rows=<b>{buyGateEvidenceReviewCount}/{buyGateEvidenceTraceRows.length}</b> · mode=<b>{buyGateTimelineVerdict}</b>');
  });
});
