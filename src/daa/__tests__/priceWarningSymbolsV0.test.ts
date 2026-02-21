import { describe, expect, it } from 'vitest';

import { buildPriceWarningSymbolSetV0 } from '../priceWarningSymbolsV0';

describe('priceWarningSymbolsV0', () => {
  it('normalizes warning entries from {sym} payloads and trims blanks', () => {
    const symbols = buildPriceWarningSymbolSetV0([
      { sym: ' BTC ' },
      { sym: 'ETH' },
      { sym: '' },
      null,
      undefined,
      ' SOL ',
    ]);

    expect(Array.from(symbols).sort()).toEqual(['BTC', 'ETH', 'SOL']);
  });
});
