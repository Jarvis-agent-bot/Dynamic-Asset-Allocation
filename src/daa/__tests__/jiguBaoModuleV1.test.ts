import { describe, expect, it } from "vitest";

import { buildJiguBaoModuleReportV1 } from "@/src/daa/jiguBaoModuleV1";
import type { DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

describe("jiguBaoModuleV1", () => {
  it("returns empty report when request is missing", () => {
    const report = buildJiguBaoModuleReportV1(null);

    expect(report.symbols).toEqual([]);
    expect(report.stats.symbolCount).toBe(0);
    expect(report.notes[0]).toContain("统一输入为空");
  });

  it("marks sb-tag symbol as value trap", () => {
    const request: DaaUnifiedRequestV1 = {
      account: { cash: 10_000, totalEquity: 100_000 },
      targetWeights: { TSLA: 0.25 },
      positions: [
        {
          symbol: "TSLA",
          market: "US",
          qty: 150,
          price: 200,
          tags: ["sb"],
        },
      ],
      analysts: [
        {
          analystId: "a1",
          accuracyPct: 72,
          riskControlPct: 68,
          disciplinePct: 70,
          transparencyPct: 66,
        },
      ],
      assetViews: [
        {
          symbol: "TSLA",
          analystId: "a1",
          convictionPct: 70,
          thesisDriftPct: 18,
          momentumRegime: "weak",
        },
      ],
    };

    const report = buildJiguBaoModuleReportV1(request);
    const tsla = report.symbols.find((row) => row.symbol === "TSLA");

    expect(tsla).toBeTruthy();
    expect(tsla?.isValueTrap).toBe(true);
    expect(tsla?.suggestedAction).toBe("isolate_exit");
    expect(report.stats.valueTrapCount).toBe(1);
  });
});
