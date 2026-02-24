import { describe, expect, it } from "vitest";
import {
  OPS_DAA_REQUIRED_EXECUTION_SECTIONS_V0,
  evaluateOpsDaaBotHandshakeRoutingV0,
} from "../opsBotHandshakeRoutingV0";

describe("ops-daa-bot-handshake-routing-v0", () => {
  it("allows PR-1 start only when ACK is from @Jarvis_wabicai_pm_bot and format sections are complete", () => {
    const result = evaluateOpsDaaBotHandshakeRoutingV0({
      milestoneId: "ops-daa-bot-handshake-routing-v0",
      requestedBy: "runner",
      ackBy: "@Jarvis_wabicai_pm_bot",
      ackText: "ACK: locked format confirmed",
      executionSections: [...OPS_DAA_REQUIRED_EXECUTION_SECTIONS_V0],
    });

    expect(result).toEqual({
      canStartPr1: true,
      ackValid: true,
      missingSections: [],
      reason: "ready",
    });
  });

  it("blocks PR-1 when ACK is not provided by @Jarvis_wabicai_pm_bot", () => {
    const result = evaluateOpsDaaBotHandshakeRoutingV0({
      milestoneId: "ops-daa-bot-handshake-routing-v0",
      requestedBy: "runner",
      ackBy: "@other_bot",
      ackText: "ACK",
      executionSections: [...OPS_DAA_REQUIRED_EXECUTION_SECTIONS_V0],
    });

    expect(result.canStartPr1).toBe(false);
    expect(result.ackValid).toBe(false);
    expect(result.reason).toBe("wrong-ack-author");
  });

  it("blocks PR-1 when required execution format sections are missing", () => {
    const result = evaluateOpsDaaBotHandshakeRoutingV0({
      milestoneId: "ops-daa-bot-handshake-routing-v0",
      requestedBy: "runner",
      ackBy: "@Jarvis_wabicai_pm_bot",
      ackText: "ACK",
      executionSections: ["Status", "Checks", "Risk"],
    });

    expect(result.canStartPr1).toBe(false);
    expect(result.reason).toBe("missing-execution-sections");
    expect(result.missingSections).toEqual(["Diff scope", "Rollback", "DoD"]);
  });
});
