"use client";

import { useMemo, useState } from "react";

import { copyTextToClipboard } from "../../copyToClipboard";
import { useDaaWorkflowExportBundleV1 } from "../../useDaaWorkflowExportBundleV1";
import { pretty } from "../../wizardStorage";

export default function DaaDashboardExport() {
  const { exportBundle, marketEventCount, hasRecommendation, hasAiExplain, hasHuman, hasMoneyPlan, hasTagsConfigured } = useDaaWorkflowExportBundleV1();

  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "error">("idle");

  const exportText = useMemo(() => pretty(exportBundle), [exportBundle]);

  const rebalanceLogCount = useMemo(
    () => (Array.isArray((exportBundle as any)?.rebalance_log) ? (exportBundle as any).rebalance_log.length : 0),
    [exportBundle]
  );
  const paperExecutionCount = useMemo(
    () => (Array.isArray((exportBundle as any)?.paper_execution_log) ? (exportBundle as any).paper_execution_log.length : 0),
    [exportBundle]
  );

  async function doCopy() {
    try {
      await copyTextToClipboard(exportText);
      setCopyStatus("ok");
      window.setTimeout(() => setCopyStatus("idle"), 1200);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }

  const hasRecommendationBool = !!hasRecommendation;

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>一键导出（Workflow bundle）</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            把 Step2→Step4/5→Step6→Step7 的数据打包成一个 JSON（含 rebalancing log / paper execution log / portfolio state），方便复制/分享/复盘。
          </div>
        </div>

        <button
          type="button"
          onClick={doCopy}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", fontSize: 12 }}
        >
          {copyStatus === "ok" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy export JSON"}
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: marketEventCount ? "#f0fdf4" : "#fafafa" }}>
          Step2 events: <b>{marketEventCount}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: hasMoneyPlan ? "#f0fdf4" : "#fafafa" }}>
          Step3 money plan: <b>{hasMoneyPlan ? "OK" : "missing"}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: hasRecommendationBool ? "#f0fdf4" : "#fafafa" }}>
          Step4/rec: <b>{hasRecommendationBool ? "OK" : "missing"}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: hasAiExplain ? "#f0fdf4" : "#fafafa" }}>
          Step5 explain: <b>{hasAiExplain ? "OK" : "missing"}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: hasHuman ? "#f0fdf4" : "#fafafa" }}>
          Step6 human: <b>{hasHuman ? "OK" : "missing"}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: hasTagsConfigured ? "#f0fdf4" : "#fafafa" }}>
          Step7 tags: <b>{hasTagsConfigured ? "configured" : "default"}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: rebalanceLogCount ? "#f0fdf4" : "#fafafa" }}>
          Rebalance log: <b>{rebalanceLogCount}</b>
        </span>
        <span style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid #eee", background: paperExecutionCount ? "#f0fdf4" : "#fafafa" }}>
          Paper exec: <b>{paperExecutionCount}</b>
        </span>
      </div>

      {!hasRecommendationBool ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Tip: 先在 Step4 生成一次 recommendation（会写入 localStorage）。
        </div>
      ) : null}

      {copyStatus === "error" ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#b00020" }}>
          Clipboard permission denied? Try HTTPS or copy via browser menu.
        </div>
      ) : null}
    </section>
  );
}
