"use client";

import { useEffect, useState } from "react";

import { LS_TAG_TAXONOMY, pretty, readJsonFromLs, saveJsonToLs } from "../../wizardStorage";

type TagValue = {
  key: string;
  label?: string;
  desc?: string;
};

type TagDefinition = {
  key: string;
  label: string;
  desc?: string;
  multi?: boolean;
  appliesTo?: Array<"human" | "marketEvent" | "signals" | "moneyPlan" | "recommendation">;
  values: TagValue[];
};

type TagRuleV0 = {
  id: string;
  text: string;
};

type TagTaxonomy = {
  version: 1;
  tags: TagDefinition[];
  rules?: TagRuleV0[];
};

const DEFAULT_TAXONOMY: TagTaxonomy = {
  version: 1,
  tags: [
    {
      key: "riskPreference",
      label: "Risk Preference",
      desc: "Subjective preference; used in Step6/strategy selection.",
      appliesTo: ["human", "moneyPlan"],
      values: [
        { key: "high", label: "High" },
        { key: "mid", label: "Mid" },
        { key: "low", label: "Low" },
      ],
    },
    {
      key: "riskScore",
      label: "Risk Score",
      desc: "Performance-based score (v0 manual input).",
      appliesTo: ["human"],
      values: [
        { key: "high", label: "High" },
        { key: "mid", label: "Mid" },
        { key: "low", label: "Low" },
        { key: "sb", label: "SB", desc: "the \"傻逼\" bucket" },
      ],
    },
    {
      key: "eventTags",
      label: "Event Tags",
      desc: "Common tags for MarketEvent normalization (Step2).",
      appliesTo: ["marketEvent"],
      multi: true,
      values: [
        { key: "macro" },
        { key: "rates" },
        { key: "earnings" },
        { key: "policy" },
        { key: "liquidity" },
        { key: "risk-on" },
        { key: "risk-off" },
      ],
    },
  ],
  rules: [
    {
      id: "keys-must-exist",
      text: "任何输出/输入 JSON 中出现的 tags.{key}，都必须在 tag taxonomy.tags 中声明。",
    },
    {
      id: "values-must-match",
      text: "若 tag 定义包含 values，则 tags[key] 的值必须属于 values[].key；multi=true 时允许 string[]。",
    },
  ],
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function validateAndNormalizeTaxonomy(x: unknown): TagTaxonomy {
  if (!x || typeof x !== "object") throw new Error("taxonomy must be an object");
  const t = x as any;

  if (t.version !== 1) throw new Error("version must be 1");
  if (!Array.isArray(t.tags)) throw new Error("tags must be an array");

  for (const tag of t.tags as any[]) {
    if (!tag || typeof tag !== "object") throw new Error("each tag must be an object");
    if (!isNonEmptyString(tag.key)) throw new Error("each tag needs key");
    if (!isNonEmptyString(tag.label)) throw new Error(`tag '${String(tag.key)}': label required`);
    if (!Array.isArray(tag.values)) throw new Error(`tag '${String(tag.key)}': values must be an array`);
    for (const v of tag.values as any[]) {
      if (!v || typeof v !== "object") throw new Error(`tag '${String(tag.key)}': each value must be an object`);
      if (!isNonEmptyString(v.key)) throw new Error(`tag '${String(tag.key)}': each value needs key`);
    }
  }

  let rules: TagRuleV0[] | undefined = undefined;
  if (t.rules === undefined) {
    rules = DEFAULT_TAXONOMY.rules;
  } else {
    if (!Array.isArray(t.rules)) throw new Error("rules must be an array");
    for (const r of t.rules as any[]) {
      if (!r || typeof r !== "object") throw new Error("each rule must be an object");
      if (!isNonEmptyString(r.id)) throw new Error("rule.id must be a non-empty string");
      if (!isNonEmptyString(r.text)) throw new Error("rule.text must be a non-empty string");
    }
    rules = t.rules as TagRuleV0[];
  }

  return {
    version: 1,
    tags: t.tags as TagDefinition[],
    rules,
  };
}

export default function Step7TagsPage() {
  const [rawJson, setRawJson] = useState<string>(pretty(DEFAULT_TAXONOMY));
  const [err, setErr] = useState<string>("");
  const [copyState, setCopyState] = useState<string>("");

  useEffect(() => {
    const stored = readJsonFromLs<TagTaxonomy>(LS_TAG_TAXONOMY);
    if (stored?.version === 1 && Array.isArray(stored.tags)) {
      setRawJson(pretty(stored));
    }
  }, []);

  function applyJson() {
    setErr("");
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      const normalized = validateAndNormalizeTaxonomy(parsed);
      saveJsonToLs(LS_TAG_TAXONOMY, normalized);
      setRawJson(pretty(normalized));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function copyOut() {
    setErr("");
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      const normalized = validateAndNormalizeTaxonomy(parsed);
      const payload = {
        generatedAt: new Date().toISOString(),
        tagTaxonomy: normalized,
      };
      navigator.clipboard.writeText(pretty(payload));
      setCopyState("copied");
      window.setTimeout(() => setCopyState(""), 1000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function resetDefault() {
    setErr("");
    setRawJson(pretty(DEFAULT_TAXONOMY));
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 7 — Tag 体系（v0）</h1>
      <p style={{ color: "#444" }}>
        v0：先把 Tag 的 <code>key</code>/<code>values</code>/<code>rules</code> 固定成一个可复制的 JSON（产品视角：先“能配置/能分享/可复盘”）。
      </p>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600 }}>Tag taxonomy (JSON)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={applyJson} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
              Apply
            </button>
            <button onClick={resetDefault} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
              Reset default
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
          rows={14}
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
        <div style={{ fontWeight: 600 }}>Notes</div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          这一步先只做“配置与复制”。后续 milestone 再把它接入 Step2/Step6/Step4/Step5 的输出与过滤。
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          LocalStorage key: <code>{LS_TAG_TAXONOMY}</code>
        </div>
      </section>
    </main>
  );
}
