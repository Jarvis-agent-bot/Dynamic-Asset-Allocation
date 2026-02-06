"use client";

import { useMemo, useState } from "react";

function toNumber(val) {
  if (val === "" || val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sum(arr) {
  return arr.reduce((acc, x) => acc + x, 0);
}

function pretty(x) {
  return JSON.stringify(x, null, 2);
}

function validateMoneyMgmtV0({ poolCny, allocations, limits }) {
  const errors = [];

  if (!(poolCny > 0)) errors.push("poolCny 必填且 > 0");
  if (!Array.isArray(allocations) || allocations.length < 1) errors.push("allocations 至少 1 行");

  const weights = (allocations || []).map((a) => ({
    key: String(a?.key || "").trim(),
    weightPct: toNumber(a?.weightPct),
  }));

  for (let i = 0; i < weights.length; i++) {
    const { key, weightPct } = weights[i];
    if (!key) errors.push(`allocations[${i}].key 必填`);
    if (weightPct === null) errors.push(`allocations[${i}].weightPct 必填`);
    else if (weightPct < 0 || weightPct > 100) errors.push(`allocations[${i}].weightPct 必须在 0~100`);
  }

  if (weights.length) {
    const wsum = round2(sum(weights.map((w) => (w.weightPct ?? 0))));
    if (Math.abs(wsum - 100) > 0.01) errors.push(`weightPct 总和必须 = 100（当前 ${wsum}）`);
  }

  const maxInCny = toNumber(limits?.maxInCny) ?? 0;
  const maxOutCny = toNumber(limits?.maxOutCny) ?? 0;
  if (maxInCny < 0) errors.push("maxInCny 必须 >= 0");
  if (maxOutCny < 0) errors.push("maxOutCny 必须 >= 0");

  const mode = limits?.maxPosition?.mode;
  if (mode !== "pct" && mode !== "cny") errors.push("maxPosition.mode 必须是 pct 或 cny");
  if (mode === "pct") {
    const pct = toNumber(limits?.maxPosition?.maxPositionPct);
    if (pct === null) errors.push("maxPositionPct 必填（mode=pct）");
    else if (!(pct > 0 && pct <= 100)) errors.push("maxPositionPct 必须满足 0 < pct <= 100");
  }
  if (mode === "cny") {
    const cny = toNumber(limits?.maxPosition?.maxPositionCny);
    if (cny === null) errors.push("maxPositionCny 必填（mode=cny）");
    else if (cny < 0) errors.push("maxPositionCny 必须 >= 0");
  }

  return { ok: errors.length === 0, errors };
}

export default function Step3MoneyManagementPage() {
  const [poolCny, setPoolCny] = useState("100000");
  const [allocations, setAllocations] = useState([
    { key: "core", label: "核心", weightPct: "60", tag: "risk:low" },
    { key: "satellite", label: "卫星", weightPct: "40", tag: "risk:mid" },
  ]);
  const [maxInCny, setMaxInCny] = useState("20000");
  const [maxOutCny, setMaxOutCny] = useState("20000");
  const [maxPositionMode, setMaxPositionMode] = useState("pct");
  const [maxPositionPct, setMaxPositionPct] = useState("25");
  const [maxPositionCny, setMaxPositionCny] = useState("");
  const [copiedAt, setCopiedAt] = useState(0);

  const data = useMemo(() => {
    return {
      version: "step3-money-mgmt-v0",
      poolCny: toNumber(poolCny) ?? 0,
      allocations: allocations.map((a) => ({
        key: String(a.key || "").trim(),
        label: String(a.label || "").trim(),
        weightPct: toNumber(a.weightPct) ?? 0,
        tag: String(a.tag || "").trim() || undefined,
      })),
      limits: {
        maxInCny: toNumber(maxInCny) ?? 0,
        maxOutCny: toNumber(maxOutCny) ?? 0,
        maxPosition:
          maxPositionMode === "cny"
            ? { mode: "cny", maxPositionCny: toNumber(maxPositionCny) ?? 0 }
            : { mode: "pct", maxPositionPct: toNumber(maxPositionPct) ?? 0 },
      },
    };
  }, [poolCny, allocations, maxInCny, maxOutCny, maxPositionMode, maxPositionPct, maxPositionCny]);

  const validation = useMemo(() => {
    return validateMoneyMgmtV0({
      poolCny: data.poolCny,
      allocations: allocations,
      limits: data.limits,
    });
  }, [data.poolCny, data.limits, allocations]);

  const weightSum = useMemo(() => {
    const nums = allocations.map((a) => toNumber(a.weightPct) ?? 0);
    return round2(sum(nums));
  }, [allocations]);

  async function copyJson() {
    await navigator.clipboard.writeText(pretty(data));
    setCopiedAt(Date.now());
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 3 — 金额管理（v0）</h1>
      <p style={{ color: "#444" }}>v0：mock + 本地校验 + copy JSON。先把“资金约束与分配规则”可配置化。</p>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>资金池（Pool）</div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ width: 90, color: "#666", fontSize: 12 }}>poolCny</span>
          <input
            value={poolCny}
            onChange={(e) => setPoolCny(e.target.value)}
            inputMode="decimal"
            aria-label="Pool CNY"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, minWidth: 180 }}
          />
          <span style={{ fontSize: 12, color: "#666" }}>CNY</span>
        </label>
      </section>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>比例分配（Allocation）</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              weightPct 总和：<span style={{ fontWeight: 700 }}>{weightSum}</span>
            </div>
          </div>
          <button
            onClick={() =>
              setAllocations((xs) => [...xs, { key: "", label: "", weightPct: "0", tag: "" }])
            }
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            + Add row
          </button>
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 12, color: "#666", padding: 8, borderBottom: "1px solid #eee" }}>key</th>
                <th style={{ textAlign: "left", fontSize: 12, color: "#666", padding: 8, borderBottom: "1px solid #eee" }}>label</th>
                <th style={{ textAlign: "left", fontSize: 12, color: "#666", padding: 8, borderBottom: "1px solid #eee" }}>weightPct</th>
                <th style={{ textAlign: "left", fontSize: 12, color: "#666", padding: 8, borderBottom: "1px solid #eee" }}>tag</th>
                <th style={{ width: 70, padding: 8, borderBottom: "1px solid #eee" }} />
              </tr>
            </thead>
            <tbody>
              {allocations.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                    <input
                      value={row.key}
                      onChange={(e) =>
                        setAllocations((xs) => xs.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)))
                      }
                      placeholder="core"
                      style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, width: "100%" }}
                      aria-label={`Allocation key ${idx}`}
                    />
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                    <input
                      value={row.label}
                      onChange={(e) =>
                        setAllocations((xs) => xs.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                      }
                      placeholder="核心"
                      style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, width: "100%" }}
                      aria-label={`Allocation label ${idx}`}
                    />
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        value={row.weightPct}
                        onChange={(e) =>
                          setAllocations((xs) =>
                            xs.map((x, i) => (i === idx ? { ...x, weightPct: e.target.value } : x)),
                          )
                        }
                        inputMode="decimal"
                        placeholder="0"
                        style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, width: 120 }}
                        aria-label={`Allocation weightPct ${idx}`}
                      />
                      <span style={{ fontSize: 12, color: "#666" }}>%</span>
                    </div>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                    <input
                      value={row.tag}
                      onChange={(e) =>
                        setAllocations((xs) => xs.map((x, i) => (i === idx ? { ...x, tag: e.target.value } : x)))
                      }
                      placeholder="risk:low"
                      style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, width: "100%" }}
                      aria-label={`Allocation tag ${idx}`}
                    />
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>
                    <button
                      onClick={() => setAllocations((xs) => xs.filter((_, i) => i !== idx))}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
                      aria-label={`Remove row ${idx}`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>限制（max in / max out / 最大持仓）</div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ width: 120, color: "#666", fontSize: 12 }}>maxInCny</span>
            <input
              value={maxInCny}
              onChange={(e) => setMaxInCny(e.target.value)}
              inputMode="decimal"
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, minWidth: 180 }}
            />
            <span style={{ fontSize: 12, color: "#666" }}>CNY</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ width: 120, color: "#666", fontSize: 12 }}>maxOutCny</span>
            <input
              value={maxOutCny}
              onChange={(e) => setMaxOutCny(e.target.value)}
              inputMode="decimal"
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, minWidth: 180 }}
            />
            <span style={{ fontSize: 12, color: "#666" }}>CNY</span>
          </label>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ width: 120, color: "#666", fontSize: 12 }}>maxPosition</span>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="maxPositionMode"
                checked={maxPositionMode === "pct"}
                onChange={() => setMaxPositionMode("pct")}
              />
              <span style={{ fontSize: 12 }}>pct</span>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="maxPositionMode"
                checked={maxPositionMode === "cny"}
                onChange={() => setMaxPositionMode("cny")}
              />
              <span style={{ fontSize: 12 }}>cny</span>
            </label>

            {maxPositionMode === "pct" ? (
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={maxPositionPct}
                  onChange={(e) => setMaxPositionPct(e.target.value)}
                  inputMode="decimal"
                  placeholder="25"
                  style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, width: 120 }}
                />
                <span style={{ fontSize: 12, color: "#666" }}>%</span>
              </label>
            ) : (
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={maxPositionCny}
                  onChange={(e) => setMaxPositionCny(e.target.value)}
                  inputMode="decimal"
                  placeholder="20000"
                  style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8, width: 180 }}
                />
                <span style={{ fontSize: 12, color: "#666" }}>CNY</span>
              </label>
            )}
          </div>
        </div>
      </section>

      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>输出（Copy JSON）</div>
            <div style={{ fontSize: 12, color: validation.ok ? "#166534" : "#b91c1c", marginTop: 4 }}>
              {validation.ok ? "校验通过" : `校验失败（${validation.errors.length}）`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={copyJson}
              disabled={!validation.ok}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: validation.ok ? "#fff" : "#f3f3f3",
                cursor: validation.ok ? "pointer" : "not-allowed",
              }}
            >
              Copy JSON
            </button>
            {copiedAt ? <span style={{ fontSize: 12, color: "#666" }}>copied</span> : null}
          </div>
        </div>

        {!validation.ok ? (
          <ul style={{ marginTop: 10, marginBottom: 0, paddingLeft: 18, color: "#b91c1c", fontSize: 12 }}>
            {validation.errors.map((e) => (
              <li key={e} style={{ margin: "4px 0" }}>
                {e}
              </li>
            ))}
          </ul>
        ) : null}

        <div style={{ marginTop: 10 }}>
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(data)}</pre>
        </div>
      </section>
    </main>
  );
}
