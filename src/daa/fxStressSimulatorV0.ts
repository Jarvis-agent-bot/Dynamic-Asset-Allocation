export type FxStressBookInputV0 = {
  book: "A" | "H" | "US" | "Other";
  exposure: number;
};

export type FxStressScenarioV0 = {
  cnyShockPct: number;
  hkdShockPct: number;
  usdShockPct: number;
};

export type FxStressResultRowV0 = {
  book: FxStressBookInputV0["book"];
  baseExposure: number;
  stressedExposure: number;
  impact: number;
};

const FX_SHOCK_WEIGHT_V0: Record<FxStressBookInputV0["book"], keyof FxStressScenarioV0> = {
  A: "cnyShockPct",
  H: "hkdShockPct",
  US: "usdShockPct",
  Other: "usdShockPct",
};

export function runFxStressSimulatorV0(
  books: FxStressBookInputV0[],
  scenario: FxStressScenarioV0,
): FxStressResultRowV0[] {
  return books.map((row) => {
    const baseExposure = Number.isFinite(row.exposure) ? row.exposure : 0;
    const shock = Number.isFinite(scenario[FX_SHOCK_WEIGHT_V0[row.book]]) ? scenario[FX_SHOCK_WEIGHT_V0[row.book]] : 0;
    const stressedExposure = baseExposure * (1 + shock);
    return {
      book: row.book,
      baseExposure,
      stressedExposure,
      impact: stressedExposure - baseExposure,
    };
  });
}
