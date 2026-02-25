import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-timeline-audit-f0045-v0', () => {
  it('adds critical-row and escalation-lane telemetry to factor-trace timeline verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const factorTraceTimelineCriticalCount = factorTraceEvidenceRows.filter((row) => row.evidenceStatus === 'blocked').length;");
    expect(source).toContain("const factorTraceTimelineEscalationLane = factorTraceEvidenceBlockedCount === 0");
    expect(source).toContain('T4 audit verdict: blocked-or-review rows=<b>{factorTraceEvidenceBlockedCount}/{factorTraceEvidenceRows.length}</b> · mode=<b>{factorTraceTimelineVerdict}</b> · readiness=<b>{factorTraceTimelineReadinessPct}%</b> · route=<b>{factorTraceTimelineRouteMode}</b> · critical rows=<b>{factorTraceTimelineCriticalCount}</b> · escalation lane=<b>{factorTraceTimelineEscalationLane}</b>');
  });
});
