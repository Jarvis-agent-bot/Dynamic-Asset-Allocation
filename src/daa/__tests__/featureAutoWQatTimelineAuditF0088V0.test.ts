import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-timeline-audit-f0088-v0', () => {
  it('adds review-priority telemetry to W_qat timeline telemetry', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const wQatTimelineReviewPriority = wQatTimelinePressureMode === 'critical-pressure'");
    expect(source).toContain('T5 timeline telemetry: readiness=<b>{wQatPrecheckReadinessPct}%</b> · route=<b>{wQatPrecheckRouteMode}</b> · critical gates=<b>{wQatTimelineCriticalCount}</b> · escalation lane=<b>{wQatTimelineEscalationLane}</b> · pressure mode=<b>{wQatTimelinePressureMode}</b> · review priority=<b>{wQatTimelineReviewPriority}</b>');
  });
});
