"use client";

import { useEffect, useState } from "react";

import { LS_TAG_SCHEMA, pretty, readJsonFromLs, saveJsonToLs } from "../../wizardStorage";

type TagEnumDef = {
  kind: "enum";
  values: string[];
  desc?: string;
};

type TagRuleV0 = {
  id: string;
  text: string;
};

type TagSchemaV0 = {
  schema: "daa.tagSchema.v0";
  tags: Record<string, TagEnumDef>;
  rules: TagRuleV0[];
};

const DEFAULT_SCHEMA: TagSchemaV0 = {
  schema: "daa.tagSchema.v0",
  tags: {
    riskPreference: {
      kind: "enum",
      values: ["high", "mid", "low"],
      desc: "主观风险偏好（用于 allocations/human profile 等）",
    },
    riskScore: {
      kind: "enum",
      values: ["high", "mid", "low", "sb"],
      desc: "主观评分（含 sb=傻逼 档；用于 human factor 等）",
    },
  },
  rules: [
    {
      id: "keys-must-exist",
      text: "任何输出/输入 JSON 中出现的 tags.{key}，都必须在 tag schema.tags 中声明。",
    },
    {
      id: "values-must-match",
      text: "若 schema.tags[key].kind=enum，则 tags[key] 的值必须属于 schema.tags[key].values。",
    },
  ],
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function validateSchema(x: unknown): TagSchemaV0 {
  if (!x || typeof x !== "object") throw new Error("schema must be an object");
  const s = x as any;

  if (s.schema !== "daa.tagSchema.v0") throw new Error("schema.schema must be 'daa.tagSchema.v0'");
  if (!s.tags || typeof s.tags !== "object") throw new Error("schema.tags must be an object");

  for (const [key, def] of Object.entries(s.tags as Record<string, any>)) {
    if (!isNonEmptyString(key)) throw new Error("tag key must be a non-empty string");
    if (!def || typeof def !== "object") throw new Error(`tag '${key}' definition must be an object`);
    if (def.kind !== "enum") throw new Error(`tag '${key}'.kind must be 'enum' (v0)`);
    if (!Array.isArray(def.values) || !def.values.length) throw new Error(`tag '${key}'.values must be a non-empty array`);
    if (!def.values.every(isNonEmptyString)) throw new Error(`tag '${key}'.values must be string[]`);
  }

  if (!Array.isArray(s.rules)) throw new Error("schema.rules must be an array");
  for (const r of s.rules as any[]) {
    if (!r || typeof r !== "object") throw new Error("each rule must be an object");
    if (!isNonEmptyString(r.id)) throw new Error("rule.id must be a non-empty string");
    if (!isNonEmptyString(r.text)) throw new Error("rule.text must be a non-empty string");
  }

  return s as TagSchemaV0;
}

export default function Step7TagsPage() {
  const [schema, setSchema] = useState<TagSchemaV0>(DEFAULT_SCHEMA);
  const [rawJson, setRawJson] = useState(pretty(DEFAULT_SCHEMA));
  const [err, setErr] = useState<string>("");
  const [copyState, setCopyState] = useState<string>("");

  useEffect(() => {
    const stored = readJsonFromLs<TagSchemaV0>(LS_TAG_SCHEMA);
    if (!stored) return;

    try {
      const validated = validateSchema(stored);
      setSchema(validated);
      setRawJson(pretty(validated));
    } catch {
      // ignore invalid stored data
    }
  }, []);

  function applyJson() {
    setErr("");
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      const validated = validateSchema(parsed);
      setSchema(validated);
      saveJsonToLs(LS_TAG_SCHEMA, validated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function copyOut() {
    const payload = {
      generatedAt: new Date().toISOString(),
      tagSchema: schema,
    };
    navigator.clipboard.writeText(pretty(payload));
    setCopyState("copied");
    window.setTimeout(() => setCopyState(""), 1000);
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 7 — Tag 体系（v0）</h1>
      <p style={{ color: "#444" }}>
        v0：先把 Tag 的 <code>key</code>/<code>values</code>/<code>rules</code> 固定为一份可复制 JSON，并做本地持久化。
        后续 Step 只引用（不重复定义）。
      </p>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600 }}>Tag schema (JSON)</div>
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
          rows={16}
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
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #fee2e2",
              background: "#fff1f2",
              color: "#991b1b",
              fontSize: 12,
            }}
          >
            {err}
          </div>
        ) : null}
      </section>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 12 }}>
        <div style={{ fontWeight: 600 }}>Usage (example)</div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#444" }}>
          Example tags object:
          <pre style={{ margin: "6px 0 0", padding: 10, borderRadius: 10, border: "1px solid #eee", background: "#fafafa", overflowX: "auto" }}>
            {pretty({ riskPreference: "mid", riskScore: "mid" })}
          </pre>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          LocalStorage key: <code>{LS_TAG_SCHEMA}</code>
        </div>
      </section>
    </main>
  );
}
