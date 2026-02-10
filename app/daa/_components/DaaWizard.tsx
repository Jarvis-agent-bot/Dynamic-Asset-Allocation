"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DAA_STEPS, getStep } from "../steps";
import StatusPill from "../components/StatusPill";

import Step1BacktestPage from "../step/1/page";
import Step2MarketEventsPage from "../step/2/page";
import Step3MoneyMgmtPage from "../step/3/page";
import Step4BaselineRebalancePage from "../step/4/page";
import Step5SignalDecisionPage from "../step/5/page";

const LS_ACTIVE_STEP = "daa.wizard.activeStep";

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
    // If user lands on /daa/ without a ?step=, restore last used step.
    if (pathname !== "/daa") return;
    if (searchParams.get("step")) return;

    try {
      const raw = window.localStorage.getItem(LS_ACTIVE_STEP);
      const restored = clampStepId(parseStepParam(raw));
      if (restored !== activeStepId) {
        router.replace(`/daa?step=${restored}`);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = getStep(String(activeStepId));

  function go(stepId: number) {
    const next = clampStepId(stepId);
    setActiveStepId(next);
    router.push(`/daa?step=${next}`);
    // Keep the UX feeling like "one page".
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>DAA Wizard（v0）</h1>
          <p style={{ margin: "6px 0 0", color: "#444" }}>
            你的 5 个 Step 现在在同一页面内串联执行；URL 仍可用 <code>/daa/step/*</code> 深链，便于分享与定位。
          </p>
        </div>

        <div style={{ fontSize: 12, color: "#666" }}>
          当前：Step {activeStepId}
          {step?.title ? ` — ${step.title}` : ""}
        </div>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DAA_STEPS.map((s) => {
            const isActive = s.id === activeStepId;
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
                {s.status ? <StatusPill status={s.status} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {activeStepId === 1 ? <Step1BacktestPage /> : null}
        {activeStepId === 2 ? <Step2MarketEventsPage /> : null}
        {activeStepId === 3 ? <Step3MoneyMgmtPage /> : null}
        {activeStepId === 4 ? <Step4BaselineRebalancePage /> : null}
        {activeStepId === 5 ? <Step5SignalDecisionPage /> : null}
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
        {step?.desc ? (
          <div>
            <span style={{ fontWeight: 600 }}>说明：</span> {String(step.desc)}
          </div>
        ) : null}
      </div>
    </main>
  );
}
