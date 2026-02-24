import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-evidence-panel-f0003-v0', () => {
  it('adds a W_qat formula evidence panel with top evidence guidance', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('W_qat formula evidence panel: avg quality=<b>{(qatRows.reduce((sum, row) => sum + row.quality, 0) / qatRows.length).toFixed(3)}</b>');
    expect(source).toContain("top formula evidence: <b>{explainerExample?.id || 'n/a'}</b>");
    expect(source).toContain("recommendation=<b>{explainerExample && explainerExample.quality < 0.8 ? 'inspect gate penalties before trusting weight' : 'formula signal stable'}</b>");
  });
});
