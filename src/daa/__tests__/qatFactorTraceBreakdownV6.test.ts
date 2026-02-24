import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-qat-factor-trace-breakdown-v6', () => {
  it('adds dominant gate share trace to W_qat factor breakdown panel', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const dominantGate = gateLevelTraceTotals.drift >= gateLevelTraceTotals.missing && gateLevelTraceTotals.drift >= gateLevelTraceTotals.stale');
    expect(source).toContain('const dominantGateSharePct = gateLevelTraceTotals.total > 0');
    expect(source).toContain('dominant gate=<b>{dominantGate}</b> · dominant share=<b>{dominantGateSharePct.toFixed(1)}%</b>');
  });
});
