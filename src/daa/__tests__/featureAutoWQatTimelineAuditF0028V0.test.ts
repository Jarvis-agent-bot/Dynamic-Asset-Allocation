import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-timeline-audit-f0028-v0', () => {
  it('adds timeline telemetry row for W_qat formula explainability audit', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const wQatPrecheckReadinessPct = wQatPrecheckSimulator.length');
    expect(source).toContain('T5 timeline telemetry: readiness=<b>{wQatPrecheckReadinessPct}%</b> · route=<b>{wQatPrecheckRouteMode}</b>');
  });
});
