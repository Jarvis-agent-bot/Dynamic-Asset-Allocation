import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-timeline-audit-f0107-v0', () => {
  it('adds SLA-lane telemetry to guardrail timeline audit verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const guardrailTimelineSlaLane = guardrailTimelineReviewPriority === 'p1'");
    expect(source).toContain('T4 evidence review: rows=<b>{guardrailEvidenceReviewCount}/{guardrailEvidenceTraceRows.length}</b> · mode=<b>{guardrailTimelineReviewMode}</b> · readiness=<b>{guardrailTimelineReadinessPct}%</b> · route=<b>{guardrailTimelineRouteMode}</b> · critical rows=<b>{guardrailTimelineCriticalCount}</b> · escalation lane=<b>{guardrailTimelineEscalationLane}</b> · pressure mode=<b>{guardrailTimelinePressureMode}</b> · review priority=<b>{guardrailTimelineReviewPriority}</b> · sla lane=<b>{guardrailTimelineSlaLane}</b>');
  });
});
