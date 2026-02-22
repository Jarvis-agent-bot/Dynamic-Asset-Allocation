import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-prerun-info-details-refactor-v0', () => {
  it('extracts info details block and exposes info count in summary', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const detailsFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePreRunInfoDetailsV0.tsx');
    const detailsSource = readFileSync(detailsFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalancePreRunInfoDetailsV0 from './DaaRebalancePreRunInfoDetailsV0';");
    expect(panelSource).toContain('<DaaRebalancePreRunInfoDetailsV0');
    expect(detailsSource).toContain('More details ({infoViolations.length})');
    expect(detailsSource).toContain("if (!infoViolations.length) return null;");
  });
});
