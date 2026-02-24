import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-maxin-maxout-guardrail-audit-view-v2', () => {
  it('adds breach distance and dominant side traces to guardrail audit rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const maxInBreachDistance = maxInThresholdHit ? r.maxInImpact : 0;');
    expect(source).toContain('const maxOutBreachDistance = maxOutThresholdHit ? r.maxOutImpact : 0;');
    expect(source).toContain("const dominantSide = maxInBreachDistance > maxOutBreachDistance ? 'maxIn' : maxOutBreachDistance > maxInBreachDistance ? 'maxOut' : 'balanced';");
    expect(source).toContain('maxIn distance=<b>{(maxInBreachDistance * 100).toFixed(1)}%</b>');
    expect(source).toContain('maxOut distance=<b>{(maxOutBreachDistance * 100).toFixed(1)}%</b>');
    expect(source).toContain('dominant side=<b>{dominantSide}</b>');
  });
});
