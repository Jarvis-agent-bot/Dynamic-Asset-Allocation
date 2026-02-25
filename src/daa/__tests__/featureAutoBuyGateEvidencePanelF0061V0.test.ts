import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-evidence-panel-f0061-v0', () => {
  it('adds pressure-mode telemetry to buy gate evidence verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const buyGateEvidencePressureMode = buyGateEvidenceReviewCount === 0");
    expect(source).toContain("evidence trace verdict: review rows=<b>{buyGateEvidenceReviewCount}/{buyGateEvidenceTraceRows.length}</b> · mode=<b>{buyGateEvidenceReviewCount > 0 ? 'buy-gate-evidence-review-required' : 'buy-gate-evidence-clear'}</b> · readiness=<b>{buyGateEvidenceReadinessPct}%</b> · route=<b>{buyGateEvidenceRouteMode}</b> · critical rows=<b>{buyGateEvidenceCriticalCount}</b> · escalation lane=<b>{buyGateEvidenceEscalationLane}</b> · pressure mode=<b>{buyGateEvidencePressureMode}</b>");
  });
});
