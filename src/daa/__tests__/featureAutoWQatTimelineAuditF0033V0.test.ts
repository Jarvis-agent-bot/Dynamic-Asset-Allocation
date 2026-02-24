import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-timeline-audit-f0033-v0', () => {
  it('adds formula gate-check stage to the W_qat explainability audit timeline', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const formulaTimelineVerdictMode = avgNetMultiplier < 0.8 ? 'requires-formula-review' : 'formula-ready-for-routing';");
    expect(source).toContain('T4 formula gate check: blocked gates=<b>{wQatPrecheckBlockedCount}/{wQatPrecheckSimulator.length}</b> · route mode=<b>{wQatPrecheckRouteMode}</b>');
    expect(source).toContain('timeline verdict: <b>{formulaTimelineVerdictMode}</b>');
  });
});
