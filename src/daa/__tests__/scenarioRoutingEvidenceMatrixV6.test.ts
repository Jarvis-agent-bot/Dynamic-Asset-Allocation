import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-scenario-routing-test-evidence-matrix-v6', () => {
  it('adds routing confidence tier derived from evidence consensus and snapshot alignment', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const matrixConfidenceTier = consensusStrengthPct >= 75 && gateSnapshotAlignment.includes(\'aligned\')');
    expect(source).toContain("? 'high-confidence'");
    expect(source).toContain(": 'low-confidence';");
    expect(source).toContain('routing confidence tier: <b>{matrixConfidenceTier}</b>');
  });
});
