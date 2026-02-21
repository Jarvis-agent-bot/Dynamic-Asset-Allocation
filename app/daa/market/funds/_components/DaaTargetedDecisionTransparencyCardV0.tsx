import { type TargetedDecisionTransparencyDetailV0 } from "@/src/daa/targetedDecisionTransparencyV0";

export default function DaaTargetedDecisionTransparencyCardV0(props: {
  detail: TargetedDecisionTransparencyDetailV0 | null;
}) {
  if (!props.detail) return null;

  const { detail } = props;

  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 12px",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        background: "rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 13 }}>Decision transparency · targeted slice</div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        Show the top-drift symbol with explicit inputs, gates, and rationale before action.
      </div>
      <div style={{ marginTop: 6, fontSize: 11 }}>
        <b>{detail.label}</b> ({detail.symbol})
      </div>
      <div style={{ marginTop: 6, display: "grid", gap: 4, fontSize: 11 }}>
        <div>
          inputs: current <b>{(detail.currentPct * 100).toFixed(2)}%</b> · target <b>{(detail.targetPct * 100).toFixed(2)}%</b> · drift <b>{(detail.driftPct * 100).toFixed(2)}%</b>
        </div>
        <div>
          Price source: <b>{detail.priceSource}</b> · price <b>{detail.price !== null ? detail.price.toFixed(4) : "n/a"}</b>
        </div>
        <div>
          gates: Policy drift gate <b>{detail.policyGate ? "open" : "hold"}</b> · Cash gate <b>{detail.cashGate ? "pass" : "blocked"}</b> · Liquidity gate <b>{detail.liquidityGate ? "pass" : "blocked"}</b> · Violations gate <b>{detail.violationsGate ? "pass" : "blocked"}</b>
        </div>
        <div>rationale: {detail.rationale}</div>
      </div>
    </div>
  );
}
