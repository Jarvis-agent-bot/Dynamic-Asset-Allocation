import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-precheck-simulator-f0035-v0', () => {
  it('adds a route-mode verdict to factor-trace precheck simulator transparency', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const factorPrecheckBlockedCount = simulatorRows.filter((row) => row.verdict !== 'ready').length;");
    expect(source).toContain("const factorPrecheckRouteMode = factorPrecheckBlockedCount === 0 ? 'precheck-clear' : factorPrecheckBlockedCount === 1 ? 'review-dominant-gate' : 'hold-for-remediation';");
    expect(source).toContain('precheck verdict: blocked rows=<b>{factorPrecheckBlockedCount}/{simulatorRows.length}</b> · route mode=<b>{factorPrecheckRouteMode}</b>');
  });
});
