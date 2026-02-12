"use client";

import Link from "next/link";

import Step2MarketEventsPage from "../step/_pages/Step2MarketEventsPage";
import Step4BaselineRecommendationPage from "../step/_pages/Step4BaselineRecommendationPage";
import Step6HumanFactorPage from "../step/_pages/Step6HumanFactorPage";
import Step7TagsPage from "../step/_pages/Step7TagsPage";

import DaaDashboardAiExplain from "./_components/DaaDashboardAiExplain";
import DaaDashboardExport from "./_components/DaaDashboardExport";
import DaaDashboardImport from "./_components/DaaDashboardImport";
import DaaDashboardRunChecklist from "./_components/DaaDashboardRunChecklist";

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function DaaDashboardPage() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>DAA Dashboard（v1）</h1>
          <p style={{ margin: "6px 0 0", color: "#444" }}>
            把 <b>Step2 → Step4/5 → Step6 → Step7</b> 串成一条“可执行路径”。这里是默认入口：补缺口 → 运行 → 导出。
          </p>
        </div>

        <div style={{ fontSize: 12, color: "#666" }}>
          <Link href="/daa?step=1" style={{ color: "#111" }}>
            ← Wizard
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Quick nav</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => scrollToId("import")} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}>
            Import
          </button>
          <button type="button" onClick={() => scrollToId("export")} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}>
            Export
          </button>
          <button type="button" onClick={() => scrollToId("step2")} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}>
            Step2 — Events
          </button>
          <button type="button" onClick={() => scrollToId("step4")} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}>
            Step4 — Recommendation
          </button>
          <button type="button" onClick={() => scrollToId("step5")} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}>
            Step5 — Explain
          </button>
          <button type="button" onClick={() => scrollToId("step6")} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}>
            Step6 — Human
          </button>
          <button type="button" onClick={() => scrollToId("step7")} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}>
            Step7 — Tags
          </button>
        </div>
      </div>

      <DaaDashboardRunChecklist onJump={scrollToId} />

      <div id="import" style={{ marginTop: 14, scrollMarginTop: 12 }}>
        <DaaDashboardImport />
      </div>

      <div id="export" style={{ marginTop: 14, scrollMarginTop: 12 }}>
        <DaaDashboardExport />
      </div>

      <div id="step2" style={{ marginTop: 14, scrollMarginTop: 12 }}>
        <Step2MarketEventsPage />
      </div>

      <div id="step4" style={{ marginTop: 14, scrollMarginTop: 12 }}>
        <Step4BaselineRecommendationPage />
      </div>

      <div id="step5" style={{ marginTop: 14, scrollMarginTop: 12 }}>
        <DaaDashboardAiExplain />
      </div>

      <div id="step6" style={{ marginTop: 14, scrollMarginTop: 12 }}>
        <Step6HumanFactorPage />
      </div>

      <div id="step7" style={{ marginTop: 14, scrollMarginTop: 12 }}>
        <Step7TagsPage />
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: "#666" }}>
        Tips:
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>Step4 生成的 recommendation 会持久化到 localStorage，Step5 explain 与 export 都会自动读取。</li>
          <li>如果在多个标签页同时打开，数据会通过 storage event 尝试同步刷新。</li>
        </ul>
      </div>
    </div>
  );
}
