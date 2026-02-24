import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-maxin-maxout-guardrail-audit-view-v1', () => {
  it('adds threshold breach count to maxin/maxout guardrail audit trace', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const breachCount = Number(maxInThresholdHit) + Number(maxOutThresholdHit);');
    expect(source).toContain('breaches=<b>{breachCount}</b>');
  });
});
