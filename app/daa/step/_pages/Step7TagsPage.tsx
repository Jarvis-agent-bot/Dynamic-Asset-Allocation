"use client";

import { useEffect, useState } from "react";

import { pretty, readJsonFromLs, saveJsonToLs } from "../../wizardStorage";
import { DEFAULT_TAG_TAXONOMY, isValidTagTaxonomy, LS_TAG_TAXONOMY, type TagTaxonomy } from "../../tagTaxonomy";

export default function Step7TagsPage() {
  const [rawJson, setRawJson] = useState<string>(pretty(DEFAULT_TAG_TAXONOMY));
  const [err, setErr] = useState<string>("");
  const [copyState, setCopyState] = useState<string>("");

  useEffect(() => {
    const stored = readJsonFromLs<TagTaxonomy>(LS_TAG_TAXONOMY);
    if (isValidTagTaxonomy(stored)) {
      setRawJson(pretty(stored));
    }
  }, []);

  function applyJson() {
    setErr("");
    try {
      const parsed = JSON.parse(rawJson) as TagTaxonomy;
      if (parsed?.version !== 1) throw new Error("version must be 1");
      if (!Array.isArray(parsed.tags)) throw new Error("tags must be an array");
      for (const t of parsed.tags) {
        if (!t?.key || !t?.label) throw new Error("each tag needs key + label");
        if (!Array.isArray(t.values)) throw new Error(`tag ${String(t?.key)}: values must be an array`);
        for (const tv of t.values) {
          if (!tv?.key) throw new Error(`tag ${String(t?.key)}: each value needs key`);
        }
      }
      saveJsonToLs(LS_TAG_TAXONOMY, parsed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function copyOut() {
    try {
      const parsed = JSON.parse(rawJson) as TagTaxonomy;
      const payload = {
        generatedAt: new Date().toISOString(),
        tagTaxonomy: parsed,
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
    setRawJson(pretty(DEFAULT_TAG_TAXONOMY));
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
          这一步负责配置 taxonomy；Step2/Step6 会读取该 taxonomy 来提供下拉/校验/复制输出（形成闭环）。
        </div>
      </section>
    </main>
  );
}
