import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-precheck-simulator-f0014-v0', () => {
  it('adds a manual confirmation precheck simulator with route mode verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Manual confirmation precheck simulator');
    expect(source).toContain('const manualConfirmationPrecheckSimulator = [');
    expect(source).toContain("const manualPrecheckBlockedCount = manualConfirmationPrecheckSimulator.filter((row) => row.status === 'blocked').length;");
    expect(source).toContain("const manualPrecheckRouteMode = manualPrecheckBlockedCount === 0 ? 'execution-ready' : 'confirmation-required';");
    expect(source).toContain('precheck verdict: blocked gates=<b>{manualPrecheckBlockedCount}/{manualConfirmationPrecheckSimulator.length}</b> · route mode=<b>{manualPrecheckRouteMode}</b>');
  });
});
