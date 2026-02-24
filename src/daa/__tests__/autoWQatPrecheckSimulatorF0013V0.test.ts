import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-precheck-simulator-f0013-v0', () => {
  it('adds a W_qat explainability precheck simulator with route mode verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('W_qat precheck simulator (formula explainability)');
    expect(source).toContain('const wQatPrecheckSimulator = [');
    expect(source).toContain("const wQatPrecheckBlockedCount = wQatPrecheckSimulator.filter((row) => row.status === 'blocked').length;");
    expect(source).toContain("const wQatPrecheckRouteMode = wQatPrecheckBlockedCount === 0");
    expect(source).toContain('precheck verdict: blocked gates=<b>{wQatPrecheckBlockedCount}/{wQatPrecheckSimulator.length}</b> · route mode=<b>{wQatPrecheckRouteMode}</b>');
  });
});
