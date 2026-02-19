import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-liquidity-settlement-pretrade-gate-v0', () => {
  it('adds pre-trade liquidity + T+N settlement gate with cash-gap forecast', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Liquidity + settlement pre-trade gate');
    expect(source).toContain('Pre-trade liquidity and T+N settlement check with cash-gap forecast.');
    expect(source).toContain("const cashGap = Math.max(0, estimatedBuys - liquidityCoverage);");
    expect(source).toContain("const gate = cashGap > 0 || !settlementReady ? 'blocked' : 'pass';");
    expect(source).toContain("cash gap forecast=<b>{cashGap.toFixed(2)} {baseCcy || ''}</b>");
    expect(source).toContain('Re-run T+N preflight');
  });
});
