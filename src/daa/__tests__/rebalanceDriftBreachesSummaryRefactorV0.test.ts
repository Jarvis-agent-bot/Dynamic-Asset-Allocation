import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-drift-breaches-summary-refactor-v0', () => {
  it('extracts drift breaches summary and exposes breach count in the label', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const summaryFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalanceDriftBreachesSummaryV0.tsx');
    const summarySource = readFileSync(summaryFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalanceDriftBreachesSummaryV0 from './DaaRebalanceDriftBreachesSummaryV0';");
    expect(panelSource).toContain('<DaaRebalanceDriftBreachesSummaryV0 breaches={paperRunDriftAlert.breaches} />');
    expect(summarySource).toContain('Breaches ({breaches.length}):');
    expect(summarySource).toContain('No symbols exceed the drift threshold.');
  });
});
