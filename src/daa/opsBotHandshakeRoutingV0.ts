export const OPS_DAA_REQUIRED_EXECUTION_SECTIONS_V0 = [
  "Status",
  "Diff scope",
  "Checks",
  "Risk",
  "Rollback",
  "DoD",
] as const;

export type OpsDaaRequiredExecutionSectionV0 =
  (typeof OPS_DAA_REQUIRED_EXECUTION_SECTIONS_V0)[number];

export type OpsDaaBotHandshakeRequestV0 = {
  milestoneId: string;
  requestedBy: string;
  ackBy: string;
  ackText: string;
  executionSections: string[];
};

export type OpsDaaBotHandshakeDecisionV0 = {
  canStartPr1: boolean;
  missingSections: OpsDaaRequiredExecutionSectionV0[];
  ackValid: boolean;
  reason:
    | "ready"
    | "missing-ack"
    | "wrong-ack-author"
    | "missing-execution-sections";
};

function normalizeSectionNameV0(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasAckTokenV0(value: string): boolean {
  return /(^|\b)ACK(\b|$)/i.test(value.trim());
}

export function evaluateOpsDaaBotHandshakeRoutingV0(
  request: OpsDaaBotHandshakeRequestV0,
): OpsDaaBotHandshakeDecisionV0 {
  const missingSections = OPS_DAA_REQUIRED_EXECUTION_SECTIONS_V0.filter((requiredSection) => {
    const required = normalizeSectionNameV0(requiredSection);
    return !request.executionSections.some((provided) => normalizeSectionNameV0(provided) === required);
  });

  const ackValid = request.ackBy === "@Jarvis_wabicai_pm_bot" && hasAckTokenV0(request.ackText);
  if (!ackValid) {
    return {
      canStartPr1: false,
      missingSections,
      ackValid,
      reason: request.ackBy === "@Jarvis_wabicai_pm_bot" ? "missing-ack" : "wrong-ack-author",
    };
  }

  if (missingSections.length > 0) {
    return {
      canStartPr1: false,
      missingSections,
      ackValid,
      reason: "missing-execution-sections",
    };
  }

  return {
    canStartPr1: true,
    missingSections,
    ackValid,
    reason: "ready",
  };
}
