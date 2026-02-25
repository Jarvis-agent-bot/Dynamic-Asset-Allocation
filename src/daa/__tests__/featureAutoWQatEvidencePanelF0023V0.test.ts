import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-evidence-panel-f0023-v0', () => {
  it('adds readiness and route telemetry to W_qat explainability evidence verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const wQatEvidenceReadinessPct = wQatExplainabilityEvidenceTraceRows.length');
    expect(source).toContain("const wQatEvidenceRouteMode = wQatExplainabilityEvidenceReviewCount === 0");
    expect(source).toContain("evidence trace verdict: review rows=<b>{wQatExplainabilityEvidenceReviewCount}/{wQatExplainabilityEvidenceTraceRows.length}</b> · mode=<b>{wQatExplainabilityEvidenceReviewCount > 0 ? 'wqat-explainability-evidence-review-required' : 'wqat-explainability-evidence-clear'}</b> · readiness=<b>{wQatEvidenceReadinessPct}%</b> · route=<b>{wQatEvidenceRouteMode}</b>");
  });
});
