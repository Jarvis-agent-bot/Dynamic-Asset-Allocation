import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-guardrail-threshold-whatif-sandbox-v5', () => {
  it('adds threshold-hit row count and hit-rate summary to sandbox totals', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const thresholdHitCount = whatIfRows.filter((r) => r.maxInImpact > 0 || r.maxOutImpact > 0).length;');
    expect(source).toContain('const thresholdHitRatePct = whatIfRows.length > 0 ? Math.round((thresholdHitCount / whatIfRows.length) * 100) : 0;');
    expect(source).toContain('threshold-hit rows=<b>{thresholdHitCount}/{whatIfRows.length}</b> · hit rate=<b>{thresholdHitRatePct}%</b>');
  });
});
