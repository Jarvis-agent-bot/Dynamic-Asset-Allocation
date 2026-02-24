import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-thesis-regime-drift-alert-timeline-v2', () => {
  it('adds drift severity trace to thesis-regime drift timeline rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const driftSeverity = Math.abs(drift) >= Math.max(driftThresholdPct * 2.4, 0.07) ? 'critical' : thesisRegimeDrift ? 'warning' : 'normal';");
    expect(source).toContain('drift severity=<b>{r.driftSeverity}</b>');
  });
});
