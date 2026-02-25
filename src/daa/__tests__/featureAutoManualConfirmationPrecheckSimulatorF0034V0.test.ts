import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-precheck-simulator-f0034-v0', () => {
  it('adds checkpoint lock and operator lane telemetry to manual confirmation precheck simulator verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const manualPrecheckCheckpointGate = manualCheckpointConfirmed ? 'open' : 'locked';");
    expect(source).toContain("const manualPrecheckOperatorActionLane = manualPrecheckBlockedCount === 0 ? 'preflight-review' : 'confirm-checkpoint';");
    expect(source).toContain('precheck verdict: blocked gates=<b>{manualPrecheckBlockedCount}/{manualConfirmationPrecheckSimulator.length}</b> · route mode=<b>{manualPrecheckRouteMode}</b> · readiness=<b>{manualPrecheckReadinessPct}%</b> · handoff=<b>{manualPrecheckHandoffMode}</b> · checkpoint gate=<b>{manualPrecheckCheckpointGate}</b> · action lane=<b>{manualPrecheckOperatorActionLane}</b>');
  });
});
