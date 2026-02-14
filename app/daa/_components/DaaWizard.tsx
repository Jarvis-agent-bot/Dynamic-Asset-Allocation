"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useEffect, useMemo, useState } from "react";

import StatusPill from "../components/StatusPill";
import { DAA_STEPS, getStep } from "../steps";
import { useDaaRuntime } from "../useDaaRuntime";
import { LS_ACTIVE_STEP } from "../wizardStorage";

import Step1BacktestPage from "../step/_pages/Step1BacktestPage";
import Step2MarketEventsPage from "../step/_pages/Step2MarketEventsPage";
import Step3MoneyMgmtPage from "../step/_pages/Step3MoneyManagementPage";
import Step4BaselineRecommendationPage from "../step/_pages/Step4BaselineRecommendationPage";
import Step5SignalDecisionPage from "../step/_pages/Step5SignalDecisionSummaryPage";
import Step6HumanFactorPage from "../step/_pages/Step6HumanFactorPage";
import Step7TagsPage from "../step/_pages/Step7TagsPage";

import WizardPersistentSummary from "./WizardPersistentSummary";

function clampStepId(n: number | null | undefined): number {
  if (!n || !Number.isFinite(n)) return 1;
  const ids = DAA_STEPS.map((s) => s.id);
  if (ids.includes(n)) return n;
  return 1;
}

function parseStepParam(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function DaaWizard({ initialStepId }: { initialStepId?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const runtime = useDaaRuntime();

  const stepFromQuery = useMemo(() => clampStepId(parseStepParam(searchParams.get("step"))), [searchParams]);

  const [activeStepId, setActiveStepId] = useState(() => clampStepId(initialStepId ?? stepFromQuery));

  useEffect(() => {
    // Prefer explicit URL param, then explicit initialStepId.
    const next = clampStepId(parseStepParam(searchParams.get("step")) ?? initialStepId);
    setActiveStepId(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, initialStepId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_ACTIVE_STEP, String(activeStepId));
    } catch {
      // ignore
    }
  }, [activeStepId]);

  useEffect(() => {
    // If user lands on the wizard tab without a ?step=, restore last used step.
    const isWizardTab = pathname === "/daa/dashboard" && searchParams.get("tab") === "wizard";
    if (!isWizardTab) return;
    if (searchParams.get("step")) return;

    try {
      const raw = window.localStorage.getItem(LS_ACTIVE_STEP);
      const restored = clampStepId(parseStepParam(raw));
      if (restored !== activeStepId) {
        router.replace(`/daa/dashboard?tab=wizard&step=${restored}`);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = getStep(String(activeStepId));

  const idx = DAA_STEPS.findIndex((s) => s.id === activeStepId);
  const prevStepId = idx > 0 ? DAA_STEPS[idx - 1]?.id : null;
  const nextStepId = idx >= 0 && idx < DAA_STEPS.length - 1 ? DAA_STEPS[idx + 1]?.id : null;

  function go(stepId: number) {
    const next = clampStepId(stepId);
    setActiveStepId(next);
    router.push(`/daa/dashboard?tab=wizard&step=${next}`);
    // Keep the UX feeling like "one page".
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const runtimeStatus = runtime.stepStatusById[activeStepId];

  return (
    <main>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>DAA Wizard（v0）</h1>
          <p style={{ margin: "6px 0 0", color: "#444" }}>
            同一页面内串联 Step1-7；支持 Next/Back；canonical URL 为 <code>/daa/dashboard?tab=wizard&step=...</code>。
          </p>
        </div>

        <div style={{ fontSize: 12, color: "#666", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/daa/dashboard" style={{ color: "#111" }}>
            ← Dashboard
          </Link>
          <span style={{ color: "#bbb" }}>|</span>
          <span>
            当前：Step {activeStepId}
            {step?.title ? ` — ${step.title}` : ""}
          </span>
          {runtimeStatus ? <StatusPill status={runtimeStatus} /> : null}
        </div>
      </div>

      <section style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Next action</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
              <b>{runtime.nextActionText}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {runtime.nextStepId ? (
              <button
                type="button"
                onClick={() => go(runtime.nextStepId as number)}
                style={{
                  cursor: "pointer",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontSize: 12,
                }}
              >
                Go Step {runtime.nextStepId} →
              </button>
            ) : (
              <Link
                href="/daa/dashboard#export"
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                Export bundle →
              </Link>
            )}

            <Link href="/daa/dashboard" style={{ color: "#111", fontSize: 12 }}>
              Open dashboard
            </Link>
          </div>
        </div>
      </section>

      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DAA_STEPS.map((s) => {
            const isActive = s.id === activeStepId;
            const status = runtime.stepStatusById[s.id];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                style={{
                  cursor: "pointer",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: isActive ? "1px solid #111" : "1px solid #e5e5e5",
                  background: isActive ? "#111" : "#fafafa",
                  color: isActive ? "#fff" : "#111",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
                aria-current={isActive ? "step" : undefined}
              >
                <span style={{ fontWeight: 700 }}>Step {s.id}</span>
                <span>{s.title}</span>
                {status ? <StatusPill status={status} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <WizardPersistentSummary />
      </div>

      <div style={{ marginTop: 14 }}>
        {activeStepId === 1 ? <Step1BacktestPage /> : null}
        {activeStepId === 2 ? <Step2MarketEventsPage /> : null}
        {activeStepId === 3 ? <Step3MoneyMgmtPage /> : null}
        {activeStepId === 4 ? <Step4BaselineRecommendationPage /> : null}
        {activeStepId === 5 ? <Step5SignalDecisionPage /> : null}
        {activeStepId === 6 ? <Step6HumanFactorPage /> : null}
        {activeStepId === 7 ? <Step7TagsPage /> : null}
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => (prevStepId ? go(prevStepId) : null)}
          disabled={!prevStepId}
          style={{
            cursor: prevStepId ? "pointer" : "not-allowed",
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e5e5",
            background: prevStepId ? "#fff" : "#fafafa",
            color: "#111",
            fontSize: 13,
            opacity: prevStepId ? 1 : 0.6,
          }}
        >
          ← Back
        </button>

        <div style={{ fontSize: 12, color: "#666" }}>
          Step {activeStepId} / {DAA_STEPS.length}
        </div>

        <button
          type="button"
          onClick={() => (nextStepId ? go(nextStepId) : null)}
          disabled={!nextStepId}
          style={{
            cursor: nextStepId ? "pointer" : "not-allowed",
            padding: "8px 12px",
            borderRadius: 10,
            border: nextStepId ? "1px solid #111" : "1px solid #e5e5e5",
            background: nextStepId ? "#111" : "#fafafa",
            color: nextStepId ? "#fff" : "#111",
            fontSize: 13,
            opacity: nextStepId ? 1 : 0.6,
          }}
        >
          Next →
        </button>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>{step?.desc ? <div>{String(step.desc)}</div> : null}</div>
    </main>
  );
}
