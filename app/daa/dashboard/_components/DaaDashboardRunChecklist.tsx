"use client";

import Link from "next/link";

import { type ReactNode } from "react";

import { useDaaRuntime } from "../../useDaaRuntime";

type Props = {
  onJump: (id: string) => void;
};

type BadgeTone = "ok" | "warn" | "missing";

function Badge({ tone, text }: { tone: BadgeTone; text: string }) {
  const bg = tone === "ok" ? "#f0fdf4" : tone === "warn" ? "#fff7e6" : "#fff1f0";
  const fg = tone === "ok" ? "#237804" : tone === "warn" ? "#ad4e00" : "#a8071a";

  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.06)",
        background: bg,
        color: fg,
        fontSize: 12,
        lineHeight: "18px",
        whiteSpace: "nowrap",
      }}
      aria-label={text}
    >
      {text}
    </span>
  );
}

function JumpButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid #e5e5e5",
        background: "#fafafa",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export default function DaaDashboardRunChecklist({ onJump }: Props) {
  const rt = useDaaRuntime();

  const nextAction = rt.nextActionText;

  const step5Blocked = !rt.hasRecommendation;
  const step5Done = rt.stepStatusById[5] === "done";

  const step7Badge =
    rt.tagTaxonomyStatus === "configured"
      ? { tone: "ok" as const, text: "configured" }
      : rt.tagTaxonomyStatus === "invalid"
        ? { tone: "missing" as const, text: "invalid" }
        : { tone: "warn" as const, text: "default" };

  return (
    <section style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Run status（最短可执行路径）</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            Next: <b>{nextAction}</b>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
          <Link href="/daa/dashboard?tab=wizard&step=1" style={{ color: "#111" }}>
            Open Wizard
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Step2 — Market events</div>
            <div style={{ fontSize: 12, color: "#666" }}>影响 Step5 explain 的可追溯引用。</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge tone={rt.marketEventCount ? "ok" : "missing"} text={rt.marketEventCount ? `OK: ${rt.marketEventCount}` : "missing"} />
            <JumpButton onClick={() => onJump("step2")}>Go</JumpButton>
            <Link href="/daa/dashboard?tab=wizard&step=2" style={{ color: "#111", fontSize: 12 }}>
              Open
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Step4 — Recommendation</div>
            <div style={{ fontSize: 12, color: "#666" }}>生成 baseline recommendation（写入 localStorage）。</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge tone={rt.hasRecommendation ? "ok" : "missing"} text={rt.hasRecommendation ? "OK" : "missing"} />
            <JumpButton onClick={() => onJump("step4")}>Go</JumpButton>
            <Link href="/daa/dashboard?tab=wizard&step=4" style={{ color: "#111", fontSize: 12 }}>
              Open
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Step5 — Explain</div>
            <div style={{ fontSize: 12, color: "#666" }}>基于 Step4 + Step2 自动生成解释（不下单）。</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge
              tone={step5Blocked ? "missing" : step5Done ? "ok" : "warn"}
              text={step5Blocked ? "blocked" : step5Done ? `OK: citations ${rt.citationsCount}` : "waiting"}
            />
            <JumpButton onClick={() => onJump("step5")}>Go</JumpButton>
            <Link href="/daa/dashboard?tab=wizard&step=5" style={{ color: "#111", fontSize: 12 }}>
              Open
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Step6 — Human profile</div>
            <div style={{ fontSize: 12, color: "#666" }}>用于人因权重（风险偏好/评分等）。</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge tone={rt.hasHumanProfile ? "ok" : "missing"} text={rt.hasHumanProfile ? "OK" : "missing"} />
            <JumpButton onClick={() => onJump("step6")}>Go</JumpButton>
            <Link href="/daa/dashboard?tab=wizard&step=6" style={{ color: "#111", fontSize: 12 }}>
              Open
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Step7 — Tag taxonomy</div>
            <div style={{ fontSize: 12, color: "#666" }}>用于 Step2/Step6 输入校验与归一化。</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge tone={step7Badge.tone} text={step7Badge.text} />
            <JumpButton onClick={() => onJump("step7")}>Go</JumpButton>
            <Link href="/daa/dashboard?tab=wizard&step=7" style={{ color: "#111", fontSize: 12 }}>
              Open
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Export bundle</div>
            <div style={{ fontSize: 12, color: "#666" }}>统一从这里一键导出全量 JSON。</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge
              tone={rt.marketEventCount && rt.hasRecommendation && rt.hasHumanProfile ? "ok" : "warn"}
              text={rt.marketEventCount && rt.hasRecommendation && rt.hasHumanProfile ? "ready" : "partial"}
            />
            <JumpButton onClick={() => onJump("export")}>Go</JumpButton>
            <Link href="/daa/dashboard#export" style={{ color: "#111", fontSize: 12 }}>
              Open
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
