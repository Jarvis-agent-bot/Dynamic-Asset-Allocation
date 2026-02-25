import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-timeline-audit-f0047-v0', () => {
  it('adds critical-row and escalation-lane telemetry to guardrail timeline verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const guardrailTimelineCriticalCount = guardrailEvidenceTraceRows.filter((row) => row.evidenceStatus === 'review-required').length;");
    expect(source).toContain("const guardrailTimelineEscalationLane = guardrailEvidenceReviewCount === 0");
    expect(source).toContain('T4 evidence review: rows=<b>{guardrailEvidenceReviewCount}/{guardrailEvidenceTraceRows.length}</b> · mode=<b>{guardrailTimelineReviewMode}</b> · readiness=<b>{guardrailTimelineReadinessPct}%</b> · route=<b>{guardrailTimelineRouteMode}</b> · critical rows=<b>{guardrailTimelineCriticalCount}</b> · escalation lane=<b>{guardrailTimelineEscalationLane}</b>');
  });
});
