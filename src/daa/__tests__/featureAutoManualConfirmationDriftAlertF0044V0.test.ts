import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-drift-alert-f0044-v0', () => {
  it('adds readiness and route telemetry to manual confirmation drift alert verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const manualConfirmationDriftReadinessPct = manualConfirmationDriftAlertRows.length');
    expect(source).toContain("const manualConfirmationDriftRouteMode = manualConfirmationDriftAlertCount === 0");
    expect(source).toContain("drift alert verdict: alerts=<b>{manualConfirmationDriftAlertCount}/{manualConfirmationDriftAlertRows.length}</b> · mode=<b>{manualConfirmationDriftAlertCount > 0 ? 'manual-confirmation-required' : 'checkpoint-flow-stable'}</b> · readiness=<b>{manualConfirmationDriftReadinessPct}%</b> · route=<b>{manualConfirmationDriftRouteMode}</b>");
  });
});
