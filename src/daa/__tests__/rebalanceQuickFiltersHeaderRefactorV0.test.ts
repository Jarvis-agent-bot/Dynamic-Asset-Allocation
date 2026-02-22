import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-quick-filters-header-refactor-v0', () => {
  it('extracts quick filters header and shows total count', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const headerFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalanceQuickFiltersHeaderV0.tsx');
    const headerSource = readFileSync(headerFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalanceQuickFiltersHeaderV0 from './DaaRebalanceQuickFiltersHeaderV0';");
    expect(panelSource).toContain('<DaaRebalanceQuickFiltersHeaderV0 total={driftCounts.total} />');
    expect(headerSource).toContain('Quick filters ({total})');
  });
});
