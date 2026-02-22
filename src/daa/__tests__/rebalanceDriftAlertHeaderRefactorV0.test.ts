import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-drift-alert-header-refactor-v0', () => {
  it('extracts drift alert header and shows breach count in title', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const headerFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalanceDriftAlertHeaderV0.tsx');
    const headerSource = readFileSync(headerFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalanceDriftAlertHeaderV0 from './DaaRebalanceDriftAlertHeaderV0';");
    expect(panelSource).toContain('<DaaRebalanceDriftAlertHeaderV0');
    expect(headerSource).toContain('Live drift alerts ({breachCount})');
    expect(headerSource).toContain('maxAbsDrift=');
  });
});
