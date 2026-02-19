import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("run history anomaly highlights v0", () => {
  it("keeps anomaly highlight and likely root-cause signals in history audit", () => {
    const source = readRepoFile("app/daa/dashboard/_components/DaaDashboardHistoryAudit.tsx");

    expect(source).toContain("buildRunAnomalyHintsV0");
    expect(source).toContain("anomaly: ");
    expect(source).toContain("Likely root-cause");
    expect(source).toContain("High audit churn");
    expect(source).toContain("Burst run");
  });
});
