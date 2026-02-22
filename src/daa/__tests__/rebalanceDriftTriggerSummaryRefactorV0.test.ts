import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-drift-trigger-summary-refactor-v0', () => {
  it('extracts drift trigger summary and shows reason count in label', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const summaryFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalanceDriftTriggerSummaryV0.tsx');
    const summarySource = readFileSync(summaryFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalanceDriftTriggerSummaryV0 from './DaaRebalanceDriftTriggerSummaryV0';");
    expect(panelSource).toContain('<DaaRebalanceDriftTriggerSummaryV0');
    expect(summarySource).toContain('Trigger reasons ({reasons.length}):');
    expect(summarySource).toContain('eligibleOrders=');
  });
});
