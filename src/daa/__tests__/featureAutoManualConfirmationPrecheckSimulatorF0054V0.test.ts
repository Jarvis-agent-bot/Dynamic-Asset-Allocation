import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-precheck-simulator-f0054-v0', () => {
  it('adds critical-gate and escalation-lane telemetry to manual precheck verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const manualPrecheckCriticalGateCount = manualConfirmationPrecheckSimulator.filter((row) => row.status === 'blocked').length;");
    expect(source).toContain("const manualPrecheckEscalationLane = manualPrecheckBlockedCount === 0");
    expect(source).toContain('precheck verdict: blocked gates=<b>{manualPrecheckBlockedCount}/{manualConfirmationPrecheckSimulator.length}</b> · route mode=<b>{manualPrecheckRouteMode}</b> · readiness=<b>{manualPrecheckReadinessPct}%</b> · handoff=<b>{manualPrecheckHandoffMode}</b> · checkpoint gate=<b>{manualPrecheckCheckpointGate}</b> · action lane=<b>{manualPrecheckOperatorActionLane}</b> · critical gates=<b>{manualPrecheckCriticalGateCount}</b> · escalation lane=<b>{manualPrecheckEscalationLane}</b>');
  });
});
