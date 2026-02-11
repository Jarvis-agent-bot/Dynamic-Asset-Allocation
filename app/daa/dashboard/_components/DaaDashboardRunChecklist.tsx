"use client";

import Link from "next/link";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { analyzeDaaRecommendation } from "@/src/core/aiAnalysis";

import {
  LS_HUMAN_PROFILE,
  LS_MARKET_EVENTS,
  LS_REBALANCE_REQUEST,
  LS_REBALANCE_RESPONSE,
  WIZARD_DATA_EVENT,
  readJsonFromLs,
} from "../../wizardStorage";
import { LS_TAG_TAXONOMY } from "../../tagTaxonomy";

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
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const onData = () => setRev((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData as EventListener);
    window.addEventListener("storage", onData);
    return () => {
      window.removeEventListener(WIZARD_DATA_EVENT, onData as EventListener);
      window.removeEventListener("storage", onData);
    };
  }, []);

  const marketEvents = useMemo(() => readJsonFromLs(LS_MARKET_EVENTS), [rev]);
  const rebalanceReq = useMemo(() => readJsonFromLs(LS_REBALANCE_REQUEST), [rev]);
  const rebalanceResp = useMemo(() => readJsonFromLs(LS_REBALANCE_RESPONSE), [rev]);
  const humanProfile = useMemo(() => readJsonFromLs(LS_HUMAN_PROFILE), [rev]);
  const tagTaxonomyRaw = useMemo(() => readJsonFromLs(LS_TAG_TAXONOMY), [rev]);

  const marketEventCount = Array.isArray(marketEvents) ? marketEvents.length : 0;

  const hasRecommendation = !!rebalanceResp;
  const hasHuman = !!humanProfile;
  const tagsConfigured = !!tagTaxonomyRaw;

  const aiExplainOk = useMemo(() => {
    if (!rebalanceReq || !rebalanceResp) return false;
    try {
      return !!analyzeDaaRecommendation({
        baselineRequest: rebalanceReq,
        baselineResponse: rebalanceResp,
        marketEvents,
      });
    } catch {
      return false;
    }
  }, [marketEvents, rebalanceReq, rebalanceResp]);

  const nextAction =
    marketEventCount === 0
      ? "先补 Step2 events（至少 1 条）"
      : !hasRecommendation
        ? "去 Step4 运行一次 recommendation"
        : !hasHuman
          ? "补齐 Step6 human profile"
          : "已具备最短路径；可以导出 bundle";

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
          <Link href="/daa/wizard" style={{ color: "#111" }}>
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
            <Badge tone={marketEventCount ? "ok" : "missing"} text={marketEventCount ? `OK: ${marketEventCount}` : "missing"} />
            <JumpButton onClick={() => onJump("step2")}>Go</JumpButton>
            <Link href="/daa/step/2" style={{ color: "#111", fontSize: 12 }}>
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
            <Badge tone={hasRecommendation ? "ok" : "missing"} text={hasRecommendation ? "OK" : "missing"} />
            <JumpButton onClick={() => onJump("step4")}>Go</JumpButton>
            <Link href="/daa/step/4" style={{ color: "#111", fontSize: 12 }}>
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
              tone={hasRecommendation ? (aiExplainOk ? "ok" : "warn") : "missing"}
              text={!hasRecommendation ? "blocked" : aiExplainOk ? "OK" : "waiting"}
            />
            <JumpButton onClick={() => onJump("step5")}>Go</JumpButton>
            <Link href="/daa/step/5" style={{ color: "#111", fontSize: 12 }}>
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
            <Badge tone={hasHuman ? "ok" : "missing"} text={hasHuman ? "OK" : "missing"} />
            <JumpButton onClick={() => onJump("step6")}>Go</JumpButton>
            <Link href="/daa/step/6" style={{ color: "#111", fontSize: 12 }}>
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
            <Badge tone={tagsConfigured ? "ok" : "warn"} text={tagsConfigured ? "configured" : "default"} />
            <JumpButton onClick={() => onJump("step7")}>Go</JumpButton>
            <Link href="/daa/step/7" style={{ color: "#111", fontSize: 12 }}>
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
              tone={marketEventCount && hasRecommendation && hasHuman ? "ok" : "warn"}
              text={marketEventCount && hasRecommendation && hasHuman ? "ready" : "partial"}
            />
            <JumpButton onClick={() => onJump("export")}>Go</JumpButton>
          </div>
        </div>
      </div>
    </section>
  );
}
