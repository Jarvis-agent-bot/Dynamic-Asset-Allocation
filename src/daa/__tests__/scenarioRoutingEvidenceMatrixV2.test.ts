import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-scenario-routing-test-evidence-matrix-v2', () => {
  it('adds dominant gate snapshot to scenario routing evidence matrix', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const dominantGate = routing.stressScore >= 40');
    expect(source).toContain("? 'policy-gate'");
    expect(source).toContain("'data-quality-stale-gate'");
    expect(source).toContain('dominant gate=<b>{dominantGate}</b>');
  });
});
