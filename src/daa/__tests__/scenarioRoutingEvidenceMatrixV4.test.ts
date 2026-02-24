import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-scenario-routing-test-evidence-matrix-v4', () => {
  it('adds A/B gate snapshots to scenario routing evidence matrix', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const aGateSnapshot = routing.scenario === 'A' ? 'active' : 'standby';");
    expect(source).toContain("const bGateSnapshot = routing.scenario === 'B' ? 'active' : 'standby';");
    expect(source).toContain("const buyPathSnapshot = routing.buyPathBlocked ? 'blocked' : 'open';");
    expect(source).toContain('A/B gate snapshots: strong-hold=<b>{aGateSnapshot}</b> · value-trap=<b>{bGateSnapshot}</b> · buy-path=<b>{buyPathSnapshot}</b>');
  });
});
