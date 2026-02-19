import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-monthly-attribution-evolution-report-v0', () => {
  it('adds monthly attribution split for rebalance alpha, human-factor alpha, and avoided loss', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Monthly attribution evolution report');
    expect(source).toContain('Split monthly attribution into rebalance alpha, human-factor alpha, and avoided loss.');
    expect(source).toContain('const rebalanceAlpha = Math.max(0, sellNotional * 0.0006 - buyNotional * 0.0002);');
    expect(source).toContain('const humanFactorAlpha = Math.max(0, (100 - preRunViolationsV0.length * 8) * 0.8);');
    expect(source).toContain('const avoidedLoss = Math.max(0, driftPressure * 12 + (preTradeCashCheck.blocking ? 25 : 0));');
    expect(source).toContain('total monthly attribution: <b>{total.toFixed(2)}</b> ({baseCcy || \'base\'})');
  });
});
