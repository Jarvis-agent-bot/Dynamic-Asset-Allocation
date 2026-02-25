import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ops-daa-watchdog-stalled-milestone-alert-v0", () => {
  it("adds watchdog alerts for stalled milestones and depleted run queue with repair suggestions", () => {
    const file = resolve(process.cwd(), "app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("const milestoneStalledAlertV0 = !!latestRun");
    expect(source).toContain("const queueDepletedAlertV0 = !!runsResp && !!runsResp.ok");
    expect(source).toContain("Milestone may be stalled (");
    expect(source).toContain("Repair suggestion: rerun from Market/Funds and verify confirm/executed checkpoints");
    expect(source).toContain("Run queue looks depleted (no active created/running entries)");
    expect(source).toContain("Repair suggestion: seed a new milestone run and monitor Ops alert center");
  });
});
