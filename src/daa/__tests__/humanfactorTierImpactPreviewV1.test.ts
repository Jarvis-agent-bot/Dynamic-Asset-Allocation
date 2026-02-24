import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-humanfactor-tier-impact-preview-v1', () => {
  it('adds tier impact delta trace to analyst tier impact preview', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const tierImpactDelta = weightedPreview - r.wQat;');
    expect(source).toContain('tier impact delta=<b>{(tierImpactDelta * 100).toFixed(2)}%</b>');
  });
});
