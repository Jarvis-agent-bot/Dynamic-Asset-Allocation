import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-precheck-simulator-f0114-v0', () => {
  it('adds SLA-lane telemetry to manual confirmation precheck verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const manualPrecheckSlaLane = manualPrecheckReviewPriority === 'p1'");
    expect(source).toContain('precheck verdict: blocked gates=<b>{manualPrecheckBlockedCount}/{manualConfirmationPrecheckSimulator.length}</b> · route mode=<b>{manualPrecheckRouteMode}</b> · readiness=<b>{manualPrecheckReadinessPct}%</b> · handoff=<b>{manualPrecheckHandoffMode}</b> · checkpoint gate=<b>{manualPrecheckCheckpointGate}</b> · action lane=<b>{manualPrecheckOperatorActionLane}</b> · critical gates=<b>{manualPrecheckCriticalGateCount}</b> · escalation lane=<b>{manualPrecheckEscalationLane}</b> · pressure mode=<b>{manualPrecheckPressureMode}</b> · review priority=<b>{manualPrecheckReviewPriority}</b> · sla lane=<b>{manualPrecheckSlaLane}</b>');
  });
});
