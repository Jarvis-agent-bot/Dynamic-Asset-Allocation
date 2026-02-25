import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-timeline-audit-f0026-v0', () => {
  it('adds readiness and route telemetry to buy gate precheck timeline verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const buyGateTimelineReadinessPct = buyGateEvidenceTraceRows.length');
    expect(source).toContain("const buyGateTimelineRouteMode = buyGateEvidenceReviewCount === 0");
    expect(source).toContain('T4 timeline verdict: review rows=<b>{buyGateEvidenceReviewCount}/{buyGateEvidenceTraceRows.length}</b> · mode=<b>{buyGateTimelineVerdict}</b> · readiness=<b>{buyGateTimelineReadinessPct}%</b> · route=<b>{buyGateTimelineRouteMode}</b>');
  });
});
