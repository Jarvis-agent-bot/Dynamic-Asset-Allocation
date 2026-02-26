import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-drift-alert-f0119-v0', () => {
  it('adds owner-lane telemetry to manual confirmation drift alert verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const manualConfirmationDriftOwnerLane = manualConfirmationDriftReviewPriority === 'p1'");
    expect(source).toContain("drift alert verdict: alerts=<b>{manualConfirmationDriftAlertCount}/{manualConfirmationDriftAlertRows.length}</b> · mode=<b>{manualConfirmationDriftAlertCount > 0 ? 'manual-confirmation-required' : 'checkpoint-flow-stable'}</b> · readiness=<b>{manualConfirmationDriftReadinessPct}%</b> · route=<b>{manualConfirmationDriftRouteMode}</b> · critical alerts=<b>{manualConfirmationCriticalDriftCount}</b> · escalation lane=<b>{manualConfirmationDriftEscalationLane}</b> · pressure mode=<b>{manualConfirmationDriftPressureMode}</b> · review priority=<b>{manualConfirmationDriftReviewPriority}</b> · sla lane=<b>{manualConfirmationDriftSlaLane}</b> · owner lane=<b>{manualConfirmationDriftOwnerLane}</b>");
  });
});
