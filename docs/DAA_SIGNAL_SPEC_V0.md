# DAA Signal Spec (v0)

- Provide `ensembleSignals(strategies, series, weightsConfig, thresholds?) -> Signal[]` (BUY/SELL/HOLD).
- `Signal = { date, action, targetWeight(0..1), confidence(0..1), reasons[] }`.
- Compute ensemble target weights as fixed-weight convex combination (weights normalized at runtime).
- Map targetWeight -> action using thresholds: `buyAbove`, `sellBelow`, `minChange` (see `DEFAULT_SIGNAL_THRESHOLDS`).
- Keep reasons transparent: per-strategy weight + daily target + delta.

DONE: README + `docs/DAA_FOUNDATION.md` link to signals/spec, and `npm test` passes.
