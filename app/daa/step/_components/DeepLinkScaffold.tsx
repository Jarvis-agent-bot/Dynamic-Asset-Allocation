"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import StatusPill from "../../components/StatusPill";
import { DAA_STEPS } from "../../steps";
import { useDaaRuntime } from "../../useDaaRuntime";
import WizardPersistentSummary from "../../_components/WizardPersistentSummary";

export function DeepLinkScaffold({ stepId, children }: { stepId: number; children: ReactNode }) {
  const rt = useDaaRuntime();

  const idx = DAA_STEPS.findIndex((s) => s.id === stepId);
  const step = idx >= 0 ? DAA_STEPS[idx] : null;
  const prev = idx > 0 ? DAA_STEPS[idx - 1] : null;
  const next = idx >= 0 && idx < DAA_STEPS.length - 1 ? DAA_STEPS[idx + 1] : null;

  const status = rt.stepStatusById[stepId];

  return (
    <div>
      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff", marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Deep-link</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
              Step {stepId}
              {step?.title ? ` — ${step.title}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {status ? <StatusPill status={status} /> : null}
            <Link href="/daa/dashboard" style={{ color: "#111", fontSize: 12 }}>
              Dashboard
            </Link>
            <Link href={`/daa?step=${stepId}`} style={{ color: "#111", fontSize: 12 }}>
              Open in Wizard
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          Next: <b>{rt.nextActionText}</b>
        </div>
        {rt.nextStepId ? (
          <div style={{ marginTop: 8 }}>
            <Link
              href={`/daa?step=${rt.nextStepId}`}
              style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              Go Step {rt.nextStepId} →
            </Link>
          </div>
        ) : null}

        <div style={{ marginTop: 8, fontSize: 11, color: "#888" }}>
          Canonical: <code>/daa?step={stepId}</code> · Permalink: <code>/daa/step/{stepId}</code>
        </div>
      </section>

      <div style={{ marginTop: 12 }}>
        <WizardPersistentSummary />
      </div>

      <div style={{ marginTop: 12 }}>{children}</div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13, marginTop: 12 }}>
        <Link href="/daa/dashboard" style={{ color: "#111" }}>
          ← 控制台
        </Link>
        <span style={{ color: "#999" }}>|</span>
        {prev ? (
          <Link href={`/daa?step=${prev.id}`} style={{ color: "#111" }}>
            ← {prev.title}
          </Link>
        ) : (
          <span style={{ color: "#bbb" }}>← 上一步</span>
        )}
        {next ? (
          <Link href={`/daa?step=${next.id}`} style={{ color: "#111" }}>
            {next.title} →
          </Link>
        ) : (
          <span style={{ color: "#bbb" }}>下一步 →</span>
        )}
        <span style={{ color: "#999" }}>|</span>
        <span style={{ color: "#777", fontSize: 12 }} title="Keyboard shortcuts">
          快捷键：<kbd style={{ padding: "1px 4px", border: "1px solid #ddd", borderRadius: 4, background: "#fafafa" }}>←</kbd>
          <span style={{ margin: "0 4px" }}>/</span>
          <kbd style={{ padding: "1px 4px", border: "1px solid #ddd", borderRadius: 4, background: "#fafafa" }}>→</kbd>
        </span>
      </div>
    </div>
  );
}
