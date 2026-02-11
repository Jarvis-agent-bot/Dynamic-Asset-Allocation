"use client";

import { useEffect, useMemo, useState } from "react";

import { LS_HUMAN_PROFILE, pretty, readJsonFromLs, saveJsonToLs, WIZARD_DATA_EVENT } from "../../wizardStorage";
import { getAllowedValueKeys, getTagDef, loadTagTaxonomy } from "../../tagTaxonomy";
import { computeHumanFactor, type HumanProfile, type RiskPreference, type RiskScore } from "../../../../src/core/humanFactor";

// (moved) LS_HUMAN_PROFILE lives in app/daa/wizardStorage.ts

const FALLBACK_RISK_PREFERENCE: RiskPreference[] = ["high", "mid", "low"];
const FALLBACK_RISK_SCORE: RiskScore[] = ["high", "mid", "low", "sb"];

function asRiskPreference(x: string): RiskPreference | null {
  if (x === "high" || x === "mid" || x === "low") return x;
  return null;
}

function asRiskScore(x: string): RiskScore | null {
  if (x === "high" || x === "mid" || x === "low" || x === "sb") return x;
  return null;
}

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

  const [taxonomyRefresh, setTaxonomyRefresh] = useState(0);

  useEffect(() => {
    const stored = readJsonFromLs<HumanProfile>(LS_HUMAN_PROFILE);
    if (stored?.id && stored?.name) {
      setProfile(stored);
      setRawJson(pretty(stored));
    }
  }, []);

  useEffect(() => {
    const onData = () => setTaxonomyRefresh((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData);
    return () => window.removeEventListener(WIZARD_DATA_EVENT, onData);
  }, []);

  const taxonomy = useMemo(() => loadTagTaxonomy(), [taxonomyRefresh]);

  const riskPreferenceOptions = useMemo(() => {
    const def = getTagDef(taxonomy, "riskPreference");
    const fromTax = getAllowedValueKeys(def).map(asRiskPreference).filter(Boolean) as RiskPreference[];
    return fromTax.length ? fromTax : FALLBACK_RISK_PREFERENCE;
  }, [taxonomy]);

  const riskScoreOptions = useMemo(() => {
    const def = getTagDef(taxonomy, "riskScore");
    const fromTax = getAllowedValueKeys(def).map(asRiskScore).filter(Boolean) as RiskScore[];
    return fromTax.length ? fromTax : FALLBACK_RISK_SCORE;
  }, [taxonomy]);

  const allowRiskPreference = useMemo(() => new Set<RiskPreference>(riskPreferenceOptions), [riskPreferenceOptions]);
  const allowRiskScore = useMemo(() => new Set<RiskScore>(riskScoreOptions), [riskScoreOptions]);

  const result = useMemo(() => computeHumanFactor(profile), [profile]);

  function updateProfile(patch: Partial<HumanProfile>) {
    const next: HumanProfile = { ...profile, ...patch };
    setProfile(next);
    setRawJson(pretty(next));
    saveJsonToLs(LS_HUMAN_PROFILE, next);
  }

  function validateProfile(p: HumanProfile): string | null {
    if (!p?.id || !p?.name) return "id/name required";

    if (p.riskPreference && !allowRiskPreference.has(p.riskPreference)) {
      return `riskPreference must be one of: ${[...allowRiskPreference].join(", ")}`;
    }

    if (p.riskScore && !allowRiskScore.has(p.riskScore)) {
      return `riskScore must be one of: ${[...allowRiskScore].join(", ")}`;
    }

    return null;
  }

  function applyJson() {
    setErr("");
    try {
      const parsed = JSON.parse(rawJson) as HumanProfile;
      const e = validateProfile(parsed);
      if (e) throw new Error(e);
      setProfile(parsed);
      saveJsonToLs(LS_HUMAN_PROFILE, parsed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function copyOut() {
    setErr("");
    const e = validateProfile(profile);
    if (e) {
      setErr(e);
      return;
    }

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
        <div style={{ fontWeight: 600 }}>Quick editor (from Step7 taxonomy)</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#444" }}>
            id
            <input
              value={profile.id}
              onChange={(e) => updateProfile({ id: e.target.value })}
              style={{ display: "block", marginTop: 6, width: "100%", padding: 8, borderRadius: 8, border: "1px solid #eee" }}
            />
          </label>

          <label style={{ fontSize: 12, color: "#444" }}>
            name
            <input
              value={profile.name}
              onChange={(e) => updateProfile({ name: e.target.value })}
              style={{ display: "block", marginTop: 6, width: "100%", padding: 8, borderRadius: 8, border: "1px solid #eee" }}
            />
          </label>

          <label style={{ fontSize: 12, color: "#444" }}>
            riskPreference
            <select
              value={profile.riskPreference || ""}
              onChange={(e) => updateProfile({ riskPreference: (e.target.value ? (e.target.value as RiskPreference) : undefined) })}
              style={{ display: "block", marginTop: 6, width: "100%", padding: 8, borderRadius: 8, border: "1px solid #eee", background: "#fff" }}
            >
              <option value="">(unset)</option>
              {riskPreferenceOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, color: "#444" }}>
            riskScore
            <select
              value={profile.riskScore || ""}
              onChange={(e) => updateProfile({ riskScore: (e.target.value ? (e.target.value as RiskScore) : undefined) })}
              style={{ display: "block", marginTop: 6, width: "100%", padding: 8, borderRadius: 8, border: "1px solid #eee", background: "#fff" }}
            >
              <option value="">(unset)</option>
              {riskScoreOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          选项来自 Step7 taxonomy（你可以在 Step7 改标签集合；本页会自动刷新）。
        </div>
      </section>

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
          当前校验规则：riskPreference/riskScore 必须来自 Step7 taxonomy（或 fallback 默认集合）。
        </div>
      </section>
    </main>
  );
}
