import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-panel-live-summary-refactor-v0', () => {
  it('extracts live summary UI into a focused module and keeps timeline label visible', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const summaryFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelLiveSummaryV0.tsx');
    const summarySource = readFileSync(summaryFile, 'utf8');
    const timelineFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.liveTimelineV0.ts');
    const timelineSource = readFileSync(timelineFile, 'utf8');
    const timelineListFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelLiveTimelineListV0.tsx');
    const timelineListSource = readFileSync(timelineListFile, 'utf8');
    const emptyStateFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelLiveTimelineEmptyStateV0.tsx');
    const emptyStateSource = readFileSync(emptyStateFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalancePanelLiveSummaryV0 from './DaaRebalancePanelLiveSummaryV0';");
    expect(panelSource).toContain("import { useLiveTimelineV0 } from './DaaRebalancePanel.liveTimelineV0';");
    expect(panelSource).toContain('<DaaRebalancePanelLiveSummaryV0');
    expect(panelSource).toContain('Live execution timeline (latest 20)');
    expect(summarySource).toContain('Run DAA: {runDaaStatusText}');
    expect(summarySource).toContain('timelineSummaryLabel');
    expect(summarySource).toContain("import DaaRebalancePanelLiveTimelineListV0 from './DaaRebalancePanelLiveTimelineListV0';");
    expect(summarySource).toContain("import DaaRebalancePanelLiveTimelineEmptyStateV0 from './DaaRebalancePanelLiveTimelineEmptyStateV0';");
    expect(timelineSource).toContain('export function useLiveTimelineV0');
    expect(timelineSource).toContain("stage: 'Preflight execution'");
    expect(timelineListSource).toContain('Showing {liveTimelineV0.length} recent events.');
    expect(emptyStateSource).toContain('Live execution events will appear here after Run DAA starts (0/20 events).');
  });
});
