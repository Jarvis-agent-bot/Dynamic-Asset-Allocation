import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-scenario-routing-test-evidence-matrix-v5', () => {
  it('adds snapshot alignment verdict beside A/B gate snapshots', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const gateSnapshotAlignment = routing.scenario === \'A\'');
    expect(source).toContain("'A-path mismatch (buy path blocked)'");
    expect(source).toContain("'B-path mismatch (buy path open)'");
    expect(source).toContain('snapshot alignment verdict: <b>{gateSnapshotAlignment}</b>');
  });
});
