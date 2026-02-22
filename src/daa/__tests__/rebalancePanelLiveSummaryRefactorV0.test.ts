import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-panel-live-summary-refactor-v0', () => {
  it('extracts live summary UI into a focused module and keeps timeline label visible', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const summaryFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelLiveSummaryV0.tsx');
    const summarySource = readFileSync(summaryFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalancePanelLiveSummaryV0 from './DaaRebalancePanelLiveSummaryV0';");
    expect(panelSource).toContain('<DaaRebalancePanelLiveSummaryV0');
    expect(panelSource).toContain('Live execution timeline (latest 20)');
    expect(summarySource).toContain('Run DAA: {runDaaStatusText}');
    expect(summarySource).toContain('timelineSummaryLabel');
  });
});
