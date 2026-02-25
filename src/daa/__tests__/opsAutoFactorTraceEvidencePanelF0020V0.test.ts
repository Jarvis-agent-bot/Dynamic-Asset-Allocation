import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-evidence-panel-f0020-v0', () => {
  it('adds readiness and route telemetry to factor-trace transparency evidence verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const factorTraceEvidenceReadinessPct = factorTraceEvidenceRows.length');
    expect(source).toContain("const factorTraceEvidenceRouteMode = factorTraceEvidenceBlockedCount === 0");
    expect(source).toContain("evidence verdict: blocked-or-review rows=<b>{factorTraceEvidenceBlockedCount}/{factorTraceEvidenceRows.length}</b> · mode=<b>{factorTraceEvidenceBlockedCount > 0 ? 'factor-trace-evidence-review-required' : 'factor-trace-evidence-clear'}</b> · readiness=<b>{factorTraceEvidenceReadinessPct}%</b> · route=<b>{factorTraceEvidenceRouteMode}</b>");
  });
});
