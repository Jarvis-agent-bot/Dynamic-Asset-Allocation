import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-evidence-panel-f0120-v0', () => {
  it('adds owner-lane telemetry to factor-trace evidence verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const factorTraceEvidenceOwnerLane = factorTraceEvidenceReviewPriority === 'p1'");
    expect(source).toContain("evidence verdict: blocked-or-review rows=<b>{factorTraceEvidenceBlockedCount}/{factorTraceEvidenceRows.length}</b> · mode=<b>{factorTraceEvidenceBlockedCount > 0 ? 'factor-trace-evidence-review-required' : 'factor-trace-evidence-clear'}</b> · readiness=<b>{factorTraceEvidenceReadinessPct}%</b> · route=<b>{factorTraceEvidenceRouteMode}</b> · critical rows=<b>{factorTraceEvidenceCriticalCount}</b> · escalation lane=<b>{factorTraceEvidenceEscalationLane}</b> · pressure mode=<b>{factorTraceEvidencePressureMode}</b> · review priority=<b>{factorTraceEvidenceReviewPriority}</b> · sla lane=<b>{factorTraceEvidenceSlaLane}</b> · owner lane=<b>{factorTraceEvidenceOwnerLane}</b>");
  });
});
