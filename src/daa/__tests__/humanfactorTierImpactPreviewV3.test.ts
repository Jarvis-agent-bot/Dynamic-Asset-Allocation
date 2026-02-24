import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-humanfactor-tier-impact-preview-v3', () => {
  it('adds tier impact direction trace to analyst tier impact preview rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const tierImpactDirection = tierImpactDelta > 0 ? 'upweight' : tierImpactDelta < 0 ? 'downweight' : 'flat';");
    expect(source).toContain('tier impact direction=<b>{tierImpactDirection}</b>');
  });
});
