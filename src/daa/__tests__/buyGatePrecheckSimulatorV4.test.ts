import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-buy-gate-precheck-simulator-v4', () => {
  it('adds gate fingerprint snapshot for each buy precheck simulator row', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const gateFingerprint = `${incompetenceGate ? 'I' : '-'}${maxInGate ? 'M' : '-'}${liquidityGate ? 'L' : '-'}${settlementGate ? 'T' : '-'}`;");
    expect(source).toContain('fingerprint=<b>{gateFingerprint}</b>');
  });
});
