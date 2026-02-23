import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-humanfactor-tier-impact-preview-v0', () => {
  it('adds analyst tier impact preview on recommendation weight in W_qat factor trace', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const analystTierPreview = r.gatePenaltyTotal >= 0.35 ? 'incompetent' : r.gatePenaltyTotal >= 0.2 ? 'neutral' : 'elite';");
    expect(source).toContain("const analystTierMultiplier = analystTierPreview === 'elite' ? 1.05 : analystTierPreview === 'neutral' ? 1 : 0.85;");
    expect(source).toContain('const weightedPreview = r.wQat * analystTierMultiplier;');
    expect(source).toContain('analyst-tier=<b>{analystTierPreview}</b> (x{analystTierMultiplier.toFixed(2)}) => preview weight=<b>{(weightedPreview * 100).toFixed(2)}%</b>');
  });
});
