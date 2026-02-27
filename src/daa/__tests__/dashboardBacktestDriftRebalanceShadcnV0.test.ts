import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readComponent(): string {
  const p = path.resolve(process.cwd(), "app/daa/dashboard/_components/DaaDashboardBacktestDriftRebalance.tsx");
  return readFileSync(p, "utf8");
}

describe("dashboard backtest/rebalance surface uses shadcn ui", () => {
  it("uses shadcn components and avoids inline style blocks", () => {
    const source = readComponent();

    expect(source).toContain('from "@/components/ui/card"');
    expect(source).toContain('from "@/components/ui/button"');
    expect(source).toContain('from "@/components/ui/input"');
    expect(source).toContain('from "@/components/ui/textarea"');
    expect(source).toContain('from "@/components/ui/table"');
    expect(source).toContain('from "@/components/ui/alert"');
    expect(source).not.toContain("style={{");
  });
});
