import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-timeline-audit-f0086-v0', () => {
  it('adds review-priority telemetry to buy-gate timeline verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const buyGateTimelineReviewPriority = buyGateTimelinePressureMode === 'critical-pressure'");
    expect(source).toContain('T4 timeline verdict: review rows=<b>{buyGateEvidenceReviewCount}/{buyGateEvidenceTraceRows.length}</b> · mode=<b>{buyGateTimelineVerdict}</b> · readiness=<b>{buyGateTimelineReadinessPct}%</b> · route=<b>{buyGateTimelineRouteMode}</b> · critical rows=<b>{buyGateTimelineCriticalCount}</b> · escalation lane=<b>{buyGateTimelineEscalationLane}</b> · pressure mode=<b>{buyGateTimelinePressureMode}</b> · review priority=<b>{buyGateTimelineReviewPriority}</b>');
  });
});
