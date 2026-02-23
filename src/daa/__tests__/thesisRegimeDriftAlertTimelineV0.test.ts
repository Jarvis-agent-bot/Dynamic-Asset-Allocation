import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-thesis-regime-drift-alert-timeline-v0', () => {
  it('adds thesis-regime drift alert timeline with down-weight rationale', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const thesisRegimeDrift = Math.abs(drift) >= Math.max(driftThresholdPct * 1.8, 0.05);');
    expect(source).toContain("const downWeightFactor = thesisRegimeDrift ? 0.85 : 1;");
    expect(source).toContain('Thesis-regime drift alert timeline (down-weight rationale)');
    expect(source).toContain("thesis/regime drift={r.thesisRegimeDrift ? 'alert' : 'stable'} · down-weight factor=<b>{r.downWeightFactor.toFixed(2)}</b>");
    expect(source).toContain("rationale={r.thesisRegimeDrift ? 'drift above tolerance; reduce recommendation weight' : 'inside tolerance; keep baseline weight'}");
  });
});
