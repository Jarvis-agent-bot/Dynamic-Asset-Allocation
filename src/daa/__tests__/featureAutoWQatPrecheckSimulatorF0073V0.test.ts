import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-precheck-simulator-f0073-v0', () => {
  it('adds pressure-mode telemetry to W_qat precheck verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const wQatPrecheckPressureMode = wQatPrecheckBlockedCount === 0");
    expect(source).toContain('precheck verdict: blocked gates=<b>{wQatPrecheckBlockedCount}/{wQatPrecheckSimulator.length}</b> · route mode=<b>{wQatPrecheckRouteMode}</b> · readiness=<b>{wQatPrecheckReadinessPct}%</b> · handoff=<b>{wQatPrecheckHandoffMode}</b> · confidence=<b>{wQatPrecheckConfidencePct}%</b> · critical gates=<b>{wQatPrecheckCriticalCount}</b> · escalation lane=<b>{wQatPrecheckEscalationLane}</b> · pressure mode=<b>{wQatPrecheckPressureMode}</b>');
  });
});
