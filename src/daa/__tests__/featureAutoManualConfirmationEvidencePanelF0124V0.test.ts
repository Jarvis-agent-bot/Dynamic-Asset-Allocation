import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-evidence-panel-f0124-v0', () => {
  it('adds owner-lane telemetry to manual confirmation evidence verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const manualConfirmationEvidenceOwnerLane = manualConfirmationEvidenceReviewPriority === 'p1'");
    expect(source).toContain("evidence trace verdict: review rows=<b>{manualConfirmationEvidenceReviewCount}/{manualConfirmationEvidenceTraceRows.length}</b> · mode=<b>{manualConfirmationEvidenceReviewCount > 0 ? 'manual-confirmation-evidence-review-required' : 'manual-confirmation-evidence-clear'}</b> · readiness=<b>{manualConfirmationEvidenceReadinessPct}%</b> · route=<b>{manualConfirmationEvidenceRouteMode}</b> · critical rows=<b>{manualConfirmationEvidenceCriticalCount}</b> · escalation lane=<b>{manualConfirmationEvidenceEscalationLane}</b> · pressure mode=<b>{manualConfirmationEvidencePressureMode}</b> · review priority=<b>{manualConfirmationEvidenceReviewPriority}</b> · sla lane=<b>{manualConfirmationEvidenceSlaLane}</b> · owner lane=<b>{manualConfirmationEvidenceOwnerLane}</b>");
  });
});
