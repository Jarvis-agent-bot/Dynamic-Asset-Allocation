import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-qat-factor-trace-breakdown-v3', () => {
  it('adds gate penalty share to W_qat factor breakdown rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const gatePenaltyShare = 1 - r.quality;');
    expect(source).toContain('penalty-share=<b>{(gatePenaltyShare * 100).toFixed(1)}%</b>');
  });
});
