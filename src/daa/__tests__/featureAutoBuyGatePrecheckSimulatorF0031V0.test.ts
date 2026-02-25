import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-precheck-simulator-f0031-v0', () => {
  it('adds readiness and handoff telemetry to auto-buy precheck simulator verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const buyGatePrecheckReadinessPct = precheckRows.length');
    expect(source).toContain("const buyGatePrecheckHandoffMode = readyRows === precheckRows.length");
    expect(source).toContain('Auto-buy precheck simulator: ready rows=<b>{readyRows}/{precheckRows.length}</b> · route mode=<b>{routeMode}</b> · readiness=<b>{buyGatePrecheckReadinessPct}%</b> · handoff=<b>{buyGatePrecheckHandoffMode}</b>');
  });
});
