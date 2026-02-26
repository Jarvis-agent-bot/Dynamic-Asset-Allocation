import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-precheck-simulator-f0071-v0', () => {
  it('adds pressure-mode telemetry to auto-buy precheck verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const buyGatePrecheckPressureMode = readyRows === precheckRows.length");
    expect(source).toContain('Auto-buy precheck simulator: ready rows=<b>{readyRows}/{precheckRows.length}</b> · route mode=<b>{routeMode}</b> · readiness=<b>{buyGatePrecheckReadinessPct}%</b> · handoff=<b>{buyGatePrecheckHandoffMode}</b> · critical rows=<b>{buyGatePrecheckCriticalCount}</b> · escalation lane=<b>{buyGatePrecheckEscalationLane}</b> · pressure mode=<b>{buyGatePrecheckPressureMode}</b>');
  });
});
