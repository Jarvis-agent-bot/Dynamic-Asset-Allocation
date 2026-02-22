import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-drift-action-suggestions-refactor-v0', () => {
  it('extracts breached drift action buttons and shows the action count in label', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const actionsFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalanceDriftActionSuggestionsV0.tsx');
    const actionsSource = readFileSync(actionsFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalanceDriftActionSuggestionsV0 from './DaaRebalanceDriftActionSuggestionsV0';");
    expect(panelSource).toContain('<DaaRebalanceDriftActionSuggestionsV0');
    expect(actionsSource).toContain('Threshold-based action suggestions (3):');
    expect(actionsSource).toContain('Open preflight checklist');
  });
});
