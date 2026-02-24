import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-humanfactor-tier-impact-preview-v2', () => {
  it('adds tier impact ratio trace to analyst tier impact preview rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const tierImpactPct = r.wQat > 0 ? (tierImpactDelta / r.wQat) * 100 : 0;');
    expect(source).toContain('tier impact ratio=<b>{tierImpactPct.toFixed(1)}%</b>');
  });
});
