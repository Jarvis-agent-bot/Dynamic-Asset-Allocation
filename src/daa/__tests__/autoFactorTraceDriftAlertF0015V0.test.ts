import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-drift-alert-f0015-v0', () => {
  it('adds a factor-trace drift alert view for transparency', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Factor-trace drift alert view (transparency)');
    expect(source).toContain('const factorTraceDriftAlertRows = qatRows.slice(0, 5).map((r) => {');
    expect(source).toContain("const driftAlertCount = factorTraceDriftAlertRows.filter((row) => row.driftAlert).length;");
    expect(source).toContain("status=<b>{row.driftAlert ? 'alert' : 'clear'}</b>");
    expect(source).toContain("drift alert verdict: alerts=<b>{driftAlertCount}/{factorTraceDriftAlertRows.length}</b> · mode=<b>{driftAlertCount > 0 ? 'drift-review-required' : 'drift-stable'}</b>");
  });
});
