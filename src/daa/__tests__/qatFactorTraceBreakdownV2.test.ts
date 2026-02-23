import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-qat-factor-trace-breakdown-v2', () => {
  it('adds effective multiplier trace on top of gate-level W_qat breakdown', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const effectiveMultiplier = r.targetPct > 0 ? weightedPreview / r.targetPct : 0;');
    expect(source).toContain('effective multiplier=<b>{effectiveMultiplier.toFixed(3)}</b>');
  });
});
