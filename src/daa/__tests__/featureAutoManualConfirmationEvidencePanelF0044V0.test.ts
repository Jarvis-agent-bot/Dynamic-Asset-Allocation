import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-evidence-panel-f0044-v0', () => {
  it('adds critical-row and escalation-lane telemetry to manual confirmation evidence verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const manualConfirmationEvidenceCriticalCount = manualConfirmationEvidenceTraceRows.filter((row) => row.evidenceStatus === 'review-required').length;");
    expect(source).toContain("const manualConfirmationEvidenceEscalationLane = manualConfirmationEvidenceReviewCount === 0");
    expect(source).toContain("evidence trace verdict: review rows=<b>{manualConfirmationEvidenceReviewCount}/{manualConfirmationEvidenceTraceRows.length}</b> · mode=<b>{manualConfirmationEvidenceReviewCount > 0 ? 'manual-confirmation-evidence-review-required' : 'manual-confirmation-evidence-clear'}</b> · readiness=<b>{manualConfirmationEvidenceReadinessPct}%</b> · route=<b>{manualConfirmationEvidenceRouteMode}</b> · critical rows=<b>{manualConfirmationEvidenceCriticalCount}</b> · escalation lane=<b>{manualConfirmationEvidenceEscalationLane}</b>");
  });
});
