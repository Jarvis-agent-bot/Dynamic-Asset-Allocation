import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ops-daa-dualtrack-system-bootstrap-v0", () => {
  it("shows dual-track bootstrap verdict with executor/auditor lanes and state-machine persistence", () => {
    const file = resolve(process.cwd(), "app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("const dualTrackExecutorStateV0 = latestRun");
    expect(source).toContain("const dualTrackAuditorStateV0 = latestRun");
    expect(source).toContain("const dualTrackSingleWriteEntryStateV0 = latestRun");
    expect(source).toContain("const dualTrackStateMachinePersistedV0 = latestRun");
    expect(source).toContain("const dualTrackBootstrapVerdictV0 =");
    expect(source).toContain("<CardTitle className=\"text-sm\">Dual-track bootstrap</CardTitle>");
    expect(source).toContain("Executor lane: {dualTrackExecutorStateV0} · Auditor lane: {dualTrackAuditorStateV0}");
    expect(source).toContain("Single-write entry: {dualTrackSingleWriteEntryStateV0}");
    expect(source).toContain("State machine persistence: {dualTrackStateMachinePersistedV0 ? \"persisted\" : \"not-persisted\"}");
  });
});
