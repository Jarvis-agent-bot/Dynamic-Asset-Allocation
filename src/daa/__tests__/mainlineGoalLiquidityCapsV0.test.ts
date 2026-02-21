import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mainline-goal-liquidity-caps-v0', () => {
  it('adds visible liquidity caps that clamp oversized buy notionals', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Liquidity caps');
    expect(source).toContain('Clamp buy notionals to a fixed share of available liquidity before execution routing.');
    expect(source).toContain('const liquidityCapPct = 0.3;');
    expect(source).toContain('const perOrderLiquidityCap = Math.max(0, liquidityCoverage * liquidityCapPct);');
    expect(source).toContain('const cappedNotional = Math.min(rawNotional, perOrderLiquidityCap);');
    expect(source).toContain("BUY {o.rawNotional.toFixed(2)} {'->'} <b>{o.cappedNotional.toFixed(2)}</b> {baseCcy || ''}");
  });
});
