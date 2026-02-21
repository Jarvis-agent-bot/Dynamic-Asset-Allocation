import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-decision-cards-price-warning-symbol-routing-v0', () => {
  it('derives missing/stale symbol sets from warning sym payloads', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('buildPriceWarningSymbolSetV0');
    expect(source).toContain('missingSet.has(r.id) ? \'yes\' : \'no\'');
    expect(source).toContain('staleSet.has(r.id) ? \'yes\' : \'no\'');
  });
});
