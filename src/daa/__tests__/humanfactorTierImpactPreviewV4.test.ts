import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-humanfactor-tier-impact-preview-v4', () => {
  it('adds tier impact band trace to analyst tier impact preview rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const tierImpactBand = Math.abs(tierImpactPct) >= 20 ? 'aggressive' : Math.abs(tierImpactPct) >= 10 ? 'material' : Math.abs(tierImpactPct) > 0 ? 'light' : 'neutral';");
    expect(source).toContain('tier impact band=<b>{tierImpactBand}</b>');
  });
});
