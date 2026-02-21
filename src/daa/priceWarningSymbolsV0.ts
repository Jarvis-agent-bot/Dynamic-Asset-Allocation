type PriceWarningEntryV0 = { sym?: string | null } | string | null | undefined;

export function buildPriceWarningSymbolSetV0(entries: PriceWarningEntryV0[]): Set<string> {
  const symbols = new Set<string>();
  entries.forEach((entry) => {
    const raw = typeof entry === 'string' ? entry : entry?.sym;
    const sym = String(raw ?? '').trim();
    if (sym) symbols.add(sym);
  });
  return symbols;
}
