import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-precheck-simulator-f0033-v0', () => {
  it('adds confidence telemetry to W_qat precheck simulator verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const wQatPrecheckConfidencePct = Math.round((avgNetMultiplier >= 1 ? 1 : avgNetMultiplier) * 100);');
    expect(source).toContain('precheck verdict: blocked gates=<b>{wQatPrecheckBlockedCount}/{wQatPrecheckSimulator.length}</b> · route mode=<b>{wQatPrecheckRouteMode}</b> · readiness=<b>{wQatPrecheckReadinessPct}%</b> · handoff=<b>{wQatPrecheckHandoffMode}</b> · confidence=<b>{wQatPrecheckConfidencePct}%</b>');
  });
});
