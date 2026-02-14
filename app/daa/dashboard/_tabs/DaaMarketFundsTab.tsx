"use client";

import Link from "next/link";

import { DaaRebalancePanel } from "../../market/funds/_components/DaaRebalancePanel";

export default function DaaMarketFundsTab() {
  return (
    <main>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>DAA Market/Funds（v0）</h1>
          <p style={{ margin: "6px 0 0", color: "#444" }}>Legacy route <code>/daa/market/funds</code> 已合并到 dashboard tab。</p>
        </div>

        <div style={{ fontSize: 12, color: "#666", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/daa/dashboard" style={{ color: "#111" }}>
            ← Dashboard
          </Link>
          <span style={{ color: "#bbb" }}>|</span>
          <Link href="/daa/dashboard?tab=wizard&step=1" style={{ color: "#111" }}>
            Wizard
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <DaaRebalancePanel />
      </div>
    </main>
  );
}
