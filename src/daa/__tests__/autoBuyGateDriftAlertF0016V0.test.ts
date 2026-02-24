import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-drift-alert-f0016-v0', () => {
  it('adds a drift alert view for buy gate prechecks', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Buy gate drift alert view (precheck)');
    expect(source).toContain('const buyGateDriftAlertRows = precheckRows.map((row) => {');
    expect(source).toContain("const buyGateDriftAlertCount = buyGateDriftAlertRows.filter((row) => row.driftAlert).length;");
    expect(source).toContain("status=<b>{row.driftAlert ? 'alert' : 'clear'}</b>");
    expect(source).toContain("drift alert verdict: alerts=<b>{buyGateDriftAlertCount}/{buyGateDriftAlertRows.length}</b> · mode=<b>{buyGateDriftAlertCount > 0 ? 'drift-review-required' : 'drift-stable'}</b>");
  });
});
