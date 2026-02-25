import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-precheck-simulator-f0050-v0', () => {
  it('adds critical-row and escalation-lane telemetry to factor-trace precheck verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const factorPrecheckCriticalCount = simulatorRows.filter((row) => row.verdict === 'blocked').length;");
    expect(source).toContain("const factorPrecheckEscalationLane = factorPrecheckBlockedCount === 0");
    expect(source).toContain('precheck verdict: blocked rows=<b>{factorPrecheckBlockedCount}/{simulatorRows.length}</b> · route mode=<b>{factorPrecheckRouteMode}</b> · readiness=<b>{factorPrecheckReadinessPct}%</b> · critical rows=<b>{factorPrecheckCriticalCount}</b> · escalation lane=<b>{factorPrecheckEscalationLane}</b>');
  });
});
