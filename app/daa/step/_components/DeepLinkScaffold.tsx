import Link from "next/link";
import type { ReactNode } from "react";

import WizardPersistentSummary from "../../_components/WizardPersistentSummary";
import { DAA_STEPS } from "../../steps";

export function DeepLinkScaffold({ stepId, children }: { stepId: number; children: ReactNode }) {
  const idx = DAA_STEPS.findIndex((s) => s.id === stepId);
  const prev = idx > 0 ? DAA_STEPS[idx - 1] : null;
  const next = idx >= 0 && idx < DAA_STEPS.length - 1 ? DAA_STEPS[idx + 1] : null;

  return (
    <main>
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
          <Link href={`/daa/step/${prev.id}`} style={{ color: "#111" }}>
            ← {prev.title}
          </Link>
        ) : (
          <span style={{ color: "#bbb" }}>← 上一步</span>
        )}
        {next ? (
          <Link href={`/daa/step/${next.id}`} style={{ color: "#111" }}>
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
    </main>
  );
}
