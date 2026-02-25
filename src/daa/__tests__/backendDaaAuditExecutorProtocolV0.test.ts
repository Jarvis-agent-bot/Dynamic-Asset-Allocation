import { describe, expect, it } from "vitest";
import { buildDaaAuditExecutorProtocolV0 } from "../auditExecutorProtocolV0";

describe("backend-daa-audit-executor-protocol-v0", () => {
  it("builds unified Status/Diff/Checks/Risk/Rollback/DoD fields", () => {
    const protocol = buildDaaAuditExecutorProtocolV0({
      runId: "run_001",
      kind: "rebalance",
      status: "done",
      hasPortfolio: true,
      hasConfirm: true,
      hasExecuted: true,
      auditCount: 3,
    });

    expect(protocol).toEqual({
      Status: "done · rebalance",
      Diff: "single-write entry updated",
      Checks: "confirm=pass · executed=pass",
      Risk: "low",
      Rollback: "replay run run_001 from previous confirmed snapshot",
      DoD: "ready",
    });
  });

  it("keeps DoD pending when confirmation or persistence is missing", () => {
    const protocol = buildDaaAuditExecutorProtocolV0({
      runId: "run_002",
      kind: "rebalance",
      status: "running",
      hasPortfolio: true,
      hasConfirm: false,
      hasExecuted: false,
      auditCount: 0,
    });

    expect(protocol.Checks).toBe("confirm=pending · executed=pending");
    expect(protocol.DoD).toBe("pending");
    expect(protocol.Risk).toBe("medium");
  });
});
