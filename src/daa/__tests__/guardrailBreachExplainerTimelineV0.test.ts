import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGuardrailBreachExplainerTimelineV0 } from "../guardrailBreachExplainerTimelineV0";

describe("feature-guardrail-breach-explainer-timeline-v0", () => {
  it("builds gate-by-gate pass/blocked timeline rows with reasons", () => {
    const timeline = buildGuardrailBreachExplainerTimelineV0([
      { gate: "price-warnings", blocked: false, reason: "all symbols have live prices" },
      { gate: "cash-settlement", blocked: true, reason: "pre-trade cash/settlement check failed" },
    ]);

    expect(timeline).toEqual([
      { gate: "price-warnings", status: "pass", reason: "all symbols have live prices" },
      { gate: "cash-settlement", status: "blocked", reason: "pre-trade cash/settlement check failed" },
    ]);
  });

  it("renders guardrail-breach explainer timeline card in extra insights", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/daa/market/funds/_components/DaaRebalancePanelExtraInsightsV0.tsx"),
      "utf8",
    );

    expect(source).toContain("Guardrail-breach explainer timeline");
    expect(source).toContain("Gate-by-gate timeline showing why execution is blocked or allowed.");
    expect(source).toContain("const timeline = buildGuardrailBreachExplainerTimelineV0([\n");
    expect(source).toContain("gate=<b>{t.gate}</b> · status=<b style={{ color: t.status === 'pass' ? '#16a34a' : 'var(--danger)' }}>{t.status}</b> · reason={t.reason}");
  });
});
