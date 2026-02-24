import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-precheck-simulator-f0039-v0', () => {
  it('adds readiness and handoff telemetry to manual confirmation precheck simulator verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const manualPrecheckReadinessPct = manualConfirmationPrecheckSimulator.length');
    expect(source).toContain("const manualPrecheckHandoffMode = manualPrecheckBlockedCount === 0 && manualCheckpointConfirmed");
    expect(source).toContain('precheck verdict: blocked gates=<b>{manualPrecheckBlockedCount}/{manualConfirmationPrecheckSimulator.length}</b> · route mode=<b>{manualPrecheckRouteMode}</b> · readiness=<b>{manualPrecheckReadinessPct}%</b> · handoff=<b>{manualPrecheckHandoffMode}</b>');
  });
});
