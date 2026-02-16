"use client";

import { useMemo, useState } from "react";

import {
  LS_HUMAN_PROFILE,
  LS_MARKET_EVENTS,
  LS_MONEY_PLAN,
  LS_REBALANCE_REQUEST,
  LS_REBALANCE_RESPONSE,
  pretty,
  saveJsonToLs,
} from "../../wizardStorage";
import { isValidTagTaxonomy, LS_TAG_TAXONOMY } from "../../tagTaxonomy";
import { LS_LEGACY_HOLDINGS, LS_PORTFOLIO_STATE, loadLegacyHoldingsFromPortfolioState } from "../../portfolioStateStore";
import { LS_REBALANCE_SCHEDULE } from "../../rebalanceScheduleStore";
import { LS_PAPER_EXECUTION_LOG_V0 } from "@/src/daa/executionLogStore";
import { LS_REBALANCE_LOG_V0 } from "@/src/daa/rebalanceLogStore";

type DashboardBundleV1 = {
  schemaVersion: 1;
  generatedAt?: string;
  market_events: unknown;
  money_plan?: unknown;
  rebalance_request: unknown;
  recommendation: unknown;
  human_profile: unknown;
  tag_taxonomy: unknown;

  // Observability + funds hub integration.
  portfolio_state?: unknown;
  rebalance_log?: unknown;
  paper_execution_log?: unknown;
  rebalance_schedule?: unknown;

  meta?: unknown;
  ai_explain?: unknown;
};

type ImportStatus =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string; warnings: string[] };

function hasOwn(o: any, k: string): boolean {
  return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
}

function parseBundle(raw: string): { ok: true; bundle: DashboardBundleV1; warnings: string[] } | { ok: false; error: string } {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    return { ok: false, error: `Invalid JSON: ${String(e?.message || e)}` };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Invalid bundle: expected a JSON object." };
  }

  if (!hasOwn(parsed, "schemaVersion")) {
    return { ok: false, error: "Invalid bundle: missing field `schemaVersion`." };
  }
  if (parsed.schemaVersion !== 1) {
    return {
      ok: false,
      error: `Incompatible bundle schemaVersion: got ${pretty(parsed.schemaVersion)}, expected 1.`,
    };
  }

  const requiredFields = ["market_events", "rebalance_request", "recommendation", "human_profile", "tag_taxonomy"];
  const missing = requiredFields.filter((k) => !hasOwn(parsed, k));
  if (missing.length) {
    return {
      ok: false,
      error: `Invalid bundle: missing required field(s): ${missing.map((x) => `\`${x}\``).join(", ")}.`,
    };
  }

  if (!isValidTagTaxonomy(parsed.tag_taxonomy)) {
    return { ok: false, error: "Invalid bundle: `tag_taxonomy` is missing/invalid (expected version=1 taxonomy)." };
  }

  const warnings: string[] = [];
  if (parsed.market_events == null) warnings.push("market_events is null (Step2 events may stay empty)");
  if (!hasOwn(parsed, "money_plan")) {
    warnings.push("money_plan missing (legacy bundle: existing Step3 plan will be kept)");
  } else if (parsed.money_plan == null) {
    warnings.push("money_plan is null (Step3 money plan will stay empty)");
  }
  if (parsed.rebalance_request == null) warnings.push("rebalance_request is null (Step4 inputs may be missing)");
  if (parsed.recommendation == null) warnings.push("recommendation is null (Step4 output may be missing)");
  if (parsed.human_profile == null) warnings.push("human_profile is null (Step6 human factors may be missing)");
  if (!hasOwn(parsed, "portfolio_state") || parsed.portfolio_state == null) {
    warnings.push("portfolio_state missing (portfolio holdings/cash may stay unchanged)");
  }

  return { ok: true, bundle: parsed as DashboardBundleV1, warnings };
}

export default function DaaDashboardImport() {
  const [raw, setRaw] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ImportStatus>({ kind: "idle" });

  const canImport = useMemo(() => raw.trim().length > 0, [raw]);

  function doImport() {
    const res = parseBundle(raw.trim());
    if (!res.ok) {
      setStatus({ kind: "error", message: res.error });
      return;
    }

    // No external calls; this is purely localStorage state restore.
    saveJsonToLs(LS_MARKET_EVENTS, res.bundle.market_events);
    if (hasOwn(res.bundle, "money_plan")) {
      saveJsonToLs(LS_MONEY_PLAN, res.bundle.money_plan ?? null);
    }
    saveJsonToLs(LS_REBALANCE_REQUEST, res.bundle.rebalance_request);
    saveJsonToLs(LS_REBALANCE_RESPONSE, res.bundle.recommendation);
    saveJsonToLs(LS_HUMAN_PROFILE, res.bundle.human_profile);
    saveJsonToLs(LS_TAG_TAXONOMY, res.bundle.tag_taxonomy);

    // Funds hub / rebalance E2E: restore portfolio holdings + logs when present in the bundle.
    if (res.bundle.portfolio_state != null) {
      saveJsonToLs(LS_PORTFOLIO_STATE, res.bundle.portfolio_state);

      // Keep legacy key in sync so Market/Funds holds state stays consistent with DAA panels.
      try {
        saveJsonToLs(LS_LEGACY_HOLDINGS, loadLegacyHoldingsFromPortfolioState());
      } catch {
        // ignore
      }
    }

    if (res.bundle.rebalance_log != null) {
      saveJsonToLs(LS_REBALANCE_LOG_V0, res.bundle.rebalance_log);
    }

    if (res.bundle.paper_execution_log != null) {
      saveJsonToLs(LS_PAPER_EXECUTION_LOG_V0, res.bundle.paper_execution_log);
    }

    if (res.bundle.rebalance_schedule != null) {
      saveJsonToLs(LS_REBALANCE_SCHEDULE, res.bundle.rebalance_schedule);
    }

    setStatus({
      kind: "success",
      message: "Import OK. localStorage restored (Step2/3/4/5/6/7 + portfolio + logs when present).",
      warnings: res.warnings,
    });
  }

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>导入（Import bundle）</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            粘贴从 Dashboard 导出的 JSON，一键恢复 Step2/3/4/5/6/7 + portfolio state + logs 的 localStorage 状态（不会触发任何外部 API 调用）。
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e5e5", background: open ? "#111" : "#fafafa", color: open ? "#fff" : "#111", fontSize: 12 }}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setStatus({ kind: "idle" });
            }}
            placeholder="Paste export JSON here…"
            style={{ width: "100%", minHeight: 160, padding: 10, borderRadius: 10, border: "1px solid #e5e5e5", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12 }}
          />

          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={doImport}
              disabled={!canImport}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: canImport ? "#111" : "#fafafa", color: canImport ? "#fff" : "#999", fontSize: 12 }}
            >
              Import
            </button>

            <button
              type="button"
              onClick={() => {
                setRaw("");
                setStatus({ kind: "idle" });
              }}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", color: "#111", fontSize: 12 }}
            >
              Clear
            </button>
          </div>

          {status.kind === "error" ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "#b00020" }}>{status.message}</div>
          ) : null}

          {status.kind === "success" ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "#166534" }}>
              {status.message}
              {status.warnings.length ? (
                <div style={{ marginTop: 6, color: "#444" }}>
                  Warnings: {status.warnings.join("; ")}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
