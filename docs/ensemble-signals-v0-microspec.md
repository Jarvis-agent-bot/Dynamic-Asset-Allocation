# Ensemble signals (v0) — micro-spec

1) Split current `src/core/signals.js` into small modules: ensemble aggregation + signal mapping.
2) Keep thresholds neutral defaults: BUY>0.6, SELL<0.4 (minChange unchanged).
3) Public API remains: `ensembleTargetWeights`, `toSignals`, `ensembleSignals`, `DEFAULT_SIGNAL_THRESHOLDS`.
4) No behavior change intended; only refactor + exports.

DONE = `npm test` passes and existing tests import the same public API from `src/core/signals.js`.
