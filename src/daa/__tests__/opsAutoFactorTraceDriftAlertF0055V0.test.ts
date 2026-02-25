import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-drift-alert-f0055-v0', () => {
  it('adds pressure-mode telemetry to factor-trace drift alert verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const factorTraceDriftPressureMode = driftAlertCount === 0");
    expect(source).toContain("drift alert verdict: alerts=<b>{driftAlertCount}/{factorTraceDriftAlertRows.length}</b> · mode=<b>{driftAlertCount > 0 ? 'drift-review-required' : 'drift-stable'}</b> · readiness=<b>{factorTraceDriftReadinessPct}%</b> · route=<b>{factorTraceDriftRouteMode}</b> · critical alerts=<b>{factorTraceCriticalDriftCount}</b> · escalation lane=<b>{factorTraceDriftEscalationLane}</b> · pressure mode=<b>{factorTraceDriftPressureMode}</b>");
  });
});
