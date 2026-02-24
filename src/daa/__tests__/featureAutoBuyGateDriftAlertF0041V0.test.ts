import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-drift-alert-f0041-v0', () => {
  it('adds readiness and route telemetry to buy gate drift alert verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const buyGateDriftReadinessPct = buyGateDriftAlertRows.length');
    expect(source).toContain("const buyGateDriftRouteMode = buyGateDriftAlertCount === 0");
    expect(source).toContain("drift alert verdict: alerts=<b>{buyGateDriftAlertCount}/{buyGateDriftAlertRows.length}</b> · mode=<b>{buyGateDriftAlertCount > 0 ? 'drift-review-required' : 'drift-stable'}</b> · readiness=<b>{buyGateDriftReadinessPct}%</b> · route=<b>{buyGateDriftRouteMode}</b>");
  });
});
