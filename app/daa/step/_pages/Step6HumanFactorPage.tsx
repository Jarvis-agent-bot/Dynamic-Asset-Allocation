"use client";

import { useEffect, useMemo, useState } from "react";

import { pretty, readJsonFromLs, saveJsonToLs } from "../../wizardStorage";
import { computeHumanFactor } from "../../../../src/core/humanFactor";

const LS_HUMAN_PROFILE = "daa.step6.humanProfile";

type RiskPreference = "high" | "mid" | "low";
type RiskScore = "high" | "mid" | "low" | "sb";

type HumanProfile = {
  id: string;
  name: string;
  riskPreference?: RiskPreference;
  riskScore?: RiskScore;
};

const DEFAULT_PROFILE: HumanProfile = {
  id: "analyst_1",
  name: "Analyst #1",
  riskPreference: "mid",
  riskScore: "mid",
};

export default function Step6HumanFactorPage() {
  const [profile, setProfile] = useState<HumanProfile>(DEFAULT_PROFILE);
  const [rawJson, setRawJson] = useState(pretty(DEFAULT_PROFILE));
  const [err, setErr] = useState<string>("");
  const [copyState, setCopyState] = useState<string>("");

  useEffect(() => {
    const stored = readJsonFromLs<HumanProfile>(LS_HUMAN_PROFILE);
    if (stored?.id && stored?.name) {
      setProfile(stored);
      setRawJson(pretty(stored));
    }
  }, []);

  const result = useMemo(() => computeHumanFactor(profile), [profile]);

  function applyJson() {
    setErr("");
    try {
      const parsed = JSON.parse(rawJson) as HumanProfile;
      if (!parsed?.id || !parsed?.name) throw new Error("id/name required");
      setProfile(parsed);
      saveJsonToLs(LS_HUMAN_PROFILE, parsed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function copyOut() {
    const payload = {
      generatedAt: new Date().toISOString(),
      profile,
      humanFactor: result,
    };
    navigator.clipboard.writeText(pretty(payload));
    setCopyState("copied");
    window.setTimeout(() => setCopyState(""), 1000);
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 6 — 人因模型（v0）</h1>
      <p style={{ color: "#444" }}>
        v0：先把“人”的输入结构与 Tag 体系固定下来（风险偏好 + 评分），输出一个可解释的权重 <code>weight</code>。
        真实业绩/管理基金等数据源后置。
      </p>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600 }}>Human profile (JSON)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={applyJson} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
              Apply
            </button>
            <button onClick={copyOut} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
              Copy output
            </button>
            {copyState ? <span style={{ fontSize: 12, color: "#666" }}>{copyState}</span> : null}
          </div>
        </div>

        <textarea
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          rows={10}
          style={{
            marginTop: 10,
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #eee",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 12,
          }}
        />

        {err ? (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #fee2e2", background: "#fff1f2", color: "#991b1b", fontSize: 12 }}>
            {err}
          </div>
        ) : null}
      </section>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 12 }}>
        <div style={{ fontWeight: 600 }}>Result</div>
        <div style={{ marginTop: 8, fontSize: 13 }}>
          weight: <code>{result.weight.toFixed(2)}</code>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#444" }}>
          explain:
          <pre style={{ margin: "6px 0 0", padding: 10, borderRadius: 10, border: "1px solid #eee", background: "#fafafa", overflowX: "auto" }}>{pretty(result.explain)}</pre>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Tag 体系（v0）：
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li>
              riskPreference: <code>high</code> / <code>mid</code> / <code>low</code>
            </li>
            <li>
              riskScore: <code>high</code> / <code>mid</code> / <code>low</code> / <code>sb</code>（对应你说的“傻逼”档）
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
