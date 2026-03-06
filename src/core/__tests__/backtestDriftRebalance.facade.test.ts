import { describe, it, expect } from "vitest";

import { backtestDriftRebalance } from "../backtestDriftRebalance";
import * as driftEngine from "../backtest/driftRebalanceEngine";

describe("backtestDriftRebalance facade", () => {
  it("re-exports the drift rebalance engine entrypoint", () => {
    expect(backtestDriftRebalance).toBe(driftEngine.backtestDriftRebalance);
  });
});
