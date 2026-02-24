import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-prerun-violation-item-refactor-v0', () => {
  it('extracts pre-run violation row and shows details count in title', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const itemFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePreRunViolationItemV0.tsx');
    const itemSource = readFileSync(itemFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalancePreRunViolationItemV0 from './DaaRebalancePreRunViolationItemV0';");
    expect(panelSource).toContain('<DaaRebalancePreRunViolationItemV0');
    expect(itemSource).toContain("level: 'blocker' | 'warning' | 'info';");
    expect(itemSource).toContain("level === 'warning' ? '#f59e0b' : '#38bdf8'");
    expect(itemSource).toContain('({details.length} details)');
    expect(itemSource).toContain('Suggestion: {suggestion}');
  });
});
