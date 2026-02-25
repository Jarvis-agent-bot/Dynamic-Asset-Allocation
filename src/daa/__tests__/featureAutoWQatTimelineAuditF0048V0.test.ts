import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-timeline-audit-f0048-v0', () => {
  it('adds critical-gate and escalation-lane telemetry to W_qat timeline row', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const wQatTimelineCriticalCount = wQatPrecheckSimulator.filter((row) => row.status === 'blocked').length;");
    expect(source).toContain("const wQatTimelineEscalationLane = wQatPrecheckBlockedCount === 0");
    expect(source).toContain('T5 timeline telemetry: readiness=<b>{wQatPrecheckReadinessPct}%</b> · route=<b>{wQatPrecheckRouteMode}</b> · critical gates=<b>{wQatTimelineCriticalCount}</b> · escalation lane=<b>{wQatTimelineEscalationLane}</b>');
  });
});
