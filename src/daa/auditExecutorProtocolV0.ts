export type DaaAuditExecutorProtocolInputV0 = {
  runId: string;
  kind: string;
  status: string;
  hasPortfolio: boolean;
  hasConfirm: boolean;
  hasExecuted: boolean;
  auditCount: number;
};

export type DaaAuditExecutorProtocolV0 = {
  Status: string;
  Diff: string;
  Checks: string;
  Risk: string;
  Rollback: string;
  DoD: string;
};

export function buildDaaAuditExecutorProtocolV0(input: DaaAuditExecutorProtocolInputV0): DaaAuditExecutorProtocolV0 {
  const statusText = `${input.status} · ${input.kind}`;
  const diffText = input.hasPortfolio ? "single-write entry updated" : "single-write entry pending";
  const checksText = `confirm=${input.hasConfirm ? "pass" : "pending"} · executed=${input.hasExecuted ? "pass" : "pending"}`;

  const riskText = input.status === "error"
    ? "high"
    : input.hasConfirm && input.hasExecuted
      ? "low"
      : "medium";

  const rollbackText = input.hasExecuted
    ? `replay run ${input.runId} from previous confirmed snapshot`
    : "rollback not required before execution";

  const dodReady = input.hasPortfolio && input.hasConfirm && input.hasExecuted && input.auditCount > 0;
  const dodText = dodReady ? "ready" : "pending";

  return {
    Status: statusText,
    Diff: diffText,
    Checks: checksText,
    Risk: riskText,
    Rollback: rollbackText,
    DoD: dodText,
  };
}
