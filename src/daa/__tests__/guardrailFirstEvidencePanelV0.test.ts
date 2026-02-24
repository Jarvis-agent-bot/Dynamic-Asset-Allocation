import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-evidence-panel-f0002-v0', () => {
  it('adds a guardrail-first evidence panel with top evidence guidance', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Guardrail-first evidence panel: threshold-hit rows=<b>{thresholdHitCount}/{whatIfRows.length}</b>');
    expect(source).toContain('top guardrail evidence: <b>{peakImpactRow.id || \'n/a\'}</b>');
    expect(source).toContain("recommendation=<b>{pressureBias === 'maxIn-heavy' ? 'prioritize maxIn relief'");
  });
});
