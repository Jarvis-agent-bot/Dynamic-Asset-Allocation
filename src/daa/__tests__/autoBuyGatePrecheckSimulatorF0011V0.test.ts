import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-precheck-simulator-f0011-v0', () => {
  it('adds auto-buy route mode summary driven by buy gate precheck readiness', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const readyRows = precheckRows.filter((row) => row.verdict === 'ready').length;");
    expect(source).toContain("const routeMode = readyRows === precheckRows.length");
    expect(source).toContain('Auto-buy precheck simulator: ready rows=<b>{readyRows}/{precheckRows.length}</b> · route mode=<b>{routeMode}</b>');
  });
});
