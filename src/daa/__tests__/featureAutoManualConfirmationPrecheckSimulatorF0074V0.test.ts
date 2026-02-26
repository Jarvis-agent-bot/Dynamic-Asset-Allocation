import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-precheck-simulator-f0074-v0', () => {
  it('adds pressure-mode telemetry to manual precheck verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const manualPrecheckPressureMode = manualPrecheckBlockedCount === 0");
    expect(source).toContain('precheck verdict: blocked gates=<b>{manualPrecheckBlockedCount}/{manualConfirmationPrecheckSimulator.length}</b> · route mode=<b>{manualPrecheckRouteMode}</b> · readiness=<b>{manualPrecheckReadinessPct}%</b> · handoff=<b>{manualPrecheckHandoffMode}</b> · checkpoint gate=<b>{manualPrecheckCheckpointGate}</b> · action lane=<b>{manualPrecheckOperatorActionLane}</b> · critical gates=<b>{manualPrecheckCriticalGateCount}</b> · escalation lane=<b>{manualPrecheckEscalationLane}</b> · pressure mode=<b>{manualPrecheckPressureMode}</b>');
  });
});
