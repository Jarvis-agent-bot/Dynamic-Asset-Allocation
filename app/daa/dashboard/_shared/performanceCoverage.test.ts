import { describe, expect, it } from "vitest";

import { summarizeSeriesCoverage } from "./performanceCoverage";

describe("summarizeSeriesCoverage", () => {
  it("把早期稀疏历史和最近连续性分开统计", () => {
    const coverage = summarizeSeriesCoverage(
      [
        { date: "2026-05-11" },
        { date: "2026-05-16" },
        { date: "2026-05-16" },
        { date: "2026-05-19" },
        { date: "2026-05-23" },
        { date: "2026-05-26" },
        { date: "2026-06-01" },
        { date: "2026-06-02" },
        { date: "2026-06-03" },
        { date: "2026-06-06" },
        { date: "2026-06-10" },
        { date: "2026-06-12" },
        { date: "2026-06-13" },
        { date: "2026-06-14" },
        { date: "2026-06-15" },
        { date: "2026-06-16" },
        { date: "2026-06-17" },
        { date: "2026-06-18" },
        { date: "2026-06-19" },
        { date: "2026-06-20" },
        { date: "2026-06-21" },
        { date: "2026-06-22" },
      ],
      { todayDate: "2026-06-22" },
    );

    expect(coverage).toMatchObject({
      pointCount: 22,
      dateCount: 21,
      startDate: "2026-05-11",
      endDate: "2026-06-22",
      historicalMaxGapDays: 6,
      recentMaxGapDays: 2,
      warningGapDays: 0,
    });
  });

  it("最近窗口仍断档时给出当前告警", () => {
    const coverage = summarizeSeriesCoverage(
      [
        { date: "2026-05-11" },
        { date: "2026-06-10" },
        { date: "2026-06-22" },
      ],
      { todayDate: "2026-06-22" },
    );

    expect(coverage).toMatchObject({
      historicalMaxGapDays: 30,
      recentMaxGapDays: 12,
      warningGapDays: 12,
    });
  });

  it("最新快照过期时也算作最近断档", () => {
    const coverage = summarizeSeriesCoverage(
      [
        { date: "2026-06-16" },
        { date: "2026-06-17" },
        { date: "2026-06-18" },
      ],
      { todayDate: "2026-06-22" },
    );

    expect(coverage).toMatchObject({
      historicalMaxGapDays: 1,
      recentMaxGapDays: 4,
      warningGapDays: 4,
    });
  });
});
