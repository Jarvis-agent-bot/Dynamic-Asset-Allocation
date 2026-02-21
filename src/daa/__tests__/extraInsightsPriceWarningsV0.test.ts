import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-extra-insights-price-warning-routing-v0', () => {
  it('normalizes warning symbols from {sym} entries in W_qat decision flow cards', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelExtraInsightsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('function warningSymV0');
    expect(source).toContain('priceDataWarningsV0.missing.map((x) => warningSymV0(x))');
    expect(source).toContain('priceDataWarningsV0.lastClose.map((x) => warningSymV0(x))');
    expect(source).toContain('Usable W_qat decision flow');
  });
});
