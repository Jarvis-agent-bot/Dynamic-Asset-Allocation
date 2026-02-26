import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-evidence-panel-f0083-v0', () => {
  it('adds review-priority telemetry to W_qat evidence verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const wQatEvidenceReviewPriority = wQatEvidencePressureMode === 'critical-pressure'");
    expect(source).toContain("evidence trace verdict: review rows=<b>{wQatExplainabilityEvidenceReviewCount}/{wQatExplainabilityEvidenceTraceRows.length}</b> · mode=<b>{wQatExplainabilityEvidenceReviewCount > 0 ? 'wqat-explainability-evidence-review-required' : 'wqat-explainability-evidence-clear'}</b> · readiness=<b>{wQatEvidenceReadinessPct}%</b> · route=<b>{wQatEvidenceRouteMode}</b> · critical rows=<b>{wQatEvidenceCriticalCount}</b> · escalation lane=<b>{wQatEvidenceEscalationLane}</b> · pressure mode=<b>{wQatEvidencePressureMode}</b> · review priority=<b>{wQatEvidenceReviewPriority}</b>");
  });
});
