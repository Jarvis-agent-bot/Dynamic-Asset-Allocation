import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-prerun-no-blockers-refactor-v0', () => {
  it('extracts no-blockers message and shows blocker/warning counts', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const noBlockersFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePreRunNoBlockersV0.tsx');
    const noBlockersSource = readFileSync(noBlockersFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalancePreRunNoBlockersV0 from './DaaRebalancePreRunNoBlockersV0';");
    expect(panelSource).toContain('<DaaRebalancePreRunNoBlockersV0');
    expect(noBlockersSource).toContain('0 blockers');
    expect(noBlockersSource).toContain('{warningCount} warnings');
  });
});
