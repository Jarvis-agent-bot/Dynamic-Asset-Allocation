import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-pretrade-settlement-hint-refactor-v0', () => {
  it('extracts settlement hint and shows explicit settlement mode text', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const hintFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePreTradeSettlementHintV0.tsx');
    const hintSource = readFileSync(hintFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalancePreTradeSettlementHintV0 from './DaaRebalancePreTradeSettlementHintV0';");
    expect(panelSource).toContain('<DaaRebalancePreTradeSettlementHintV0 sellProceedsRoutingV0={sellProceedsRoutingV0} />');
    expect(hintSource).toContain('Settlement mode:');
    expect(hintSource).toContain('Immediate funding (T+0)');
    expect(hintSource).toContain('Conservative funding (T+1/T+2)');
  });
});
