import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-pretrade-cash-snapshot-refactor-v0', () => {
  it('extracts pre-trade cash snapshot and shows run readiness status text', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const snapshotFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePreTradeCashSnapshotV0.tsx');
    const snapshotSource = readFileSync(snapshotFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalancePreTradeCashSnapshotV0 from './DaaRebalancePreTradeCashSnapshotV0';");
    expect(panelSource).toContain('<DaaRebalancePreTradeCashSnapshotV0');
    expect(snapshotSource).toContain('Needs top-up before run');
    expect(snapshotSource).toContain('Ready for run');
  });
});
