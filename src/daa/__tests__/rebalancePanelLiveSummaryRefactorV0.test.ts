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
    expect(summarySource).toContain('Newest entries appear first.');
    expect(summarySource).toContain('Showing {liveTimelineV0.length} recent events.');
    expect(summarySource).toContain('Each event captures stage, timestamp, and status.');
    expect(summarySource).toContain('Use this stream to confirm progress before staging orders.');
    expect(summarySource).toContain('Errors surface in red so intervention is immediate.');
  });
});
