/**
 * DAA core (framework v0)
 *
 * This barrel is intended to make the v0 "core as a small library" story smoother.
 * It re-exports the stable surface area: domain types, strategies, backtest helpers,
 * provider contracts, and validation utilities.
 */

export * from "./domain";
export * from "./config";

export * from "./metrics";
export * from "./backtest";
export * from "./strategies";

export * from "./recommendEnsembleWeights";

export * from "./seriesContracts";
export * from "./providers";
export * from "./marketEvents";
export * from "./money";
