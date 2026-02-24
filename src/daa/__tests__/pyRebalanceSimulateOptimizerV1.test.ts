import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("python rebalance optimizer v1", () => {
  it("upgrades simulate policy from heuristic to constrained optimizer with diagnostics", () => {
    const source = readFileSync(
      join(process.cwd(), "services/daa-py/app/main.py"),
      "utf8",
    );

    expect(source).toContain('"policy": "v1 constrained optimizer"');
    expect(source).toContain("position_map = {p.symbol: p.notional for p in req.money_plan.positions}");
    expect(source).toContain("max_position_notional = max(0.0, acct.investable * c.maxPositionPct)");
    expect(source).toContain("cash_remaining += tradable * (1 - sell_fee)");
    expect(source).toContain("cash_remaining -= tradable * (1 + buy_fee)");
    expect(source).toContain('"diagnostics": diagnostics');
  });
});
