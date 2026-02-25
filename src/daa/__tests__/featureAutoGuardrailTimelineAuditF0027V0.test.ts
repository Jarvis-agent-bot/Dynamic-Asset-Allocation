import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-timeline-audit-f0027-v0', () => {
  it('adds readiness and route telemetry to guardrail timeline evidence review verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const guardrailTimelineReadinessPct = guardrailDecisionFlowTimeline.length');
    expect(source).toContain("const guardrailTimelineRouteMode = guardrailPrecheckBlockedCount === 0");
    expect(source).toContain('T4 evidence review: rows=<b>{guardrailEvidenceReviewCount}/{guardrailEvidenceTraceRows.length}</b> · mode=<b>{guardrailTimelineReviewMode}</b> · readiness=<b>{guardrailTimelineReadinessPct}%</b> · route=<b>{guardrailTimelineRouteMode}</b>');
  });
});
