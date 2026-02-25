import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-drift-alert-f0056-v0', () => {
  it('adds pressure-mode telemetry to buy-gate drift alert verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const buyGateDriftPressureMode = buyGateDriftAlertCount === 0");
    expect(source).toContain("drift alert verdict: alerts=<b>{buyGateDriftAlertCount}/{buyGateDriftAlertRows.length}</b> · mode=<b>{buyGateDriftAlertCount > 0 ? 'drift-review-required' : 'drift-stable'}</b> · readiness=<b>{buyGateDriftReadinessPct}%</b> · route=<b>{buyGateDriftRouteMode}</b> · critical alerts=<b>{buyGateCriticalDriftCount}</b> · escalation lane=<b>{buyGateDriftEscalationLane}</b> · pressure mode=<b>{buyGateDriftPressureMode}</b>");
  });
});
