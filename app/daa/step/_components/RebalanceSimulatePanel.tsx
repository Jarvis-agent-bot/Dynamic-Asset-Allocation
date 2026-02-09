"use client";

import { useMemo, useState } from "react";

type Props = {
  title: string;
  defaultRequest: unknown;
};

function pretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "JSON parse failed" };
  }
}

type SuggestedOrder = {
  symbol: string;
  side: string;
  notional: number;
  reason?: string;
};

function normalizeOrders(x: unknown): SuggestedOrder[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((o: any) => ({
      symbol: String(o?.symbol ?? ""),
      side: String(o?.side ?? ""),
      notional: Number(o?.notional ?? 0),
      reason: o?.reason === undefined ? undefined : String(o?.reason),
    }))
    .filter((o) => o.symbol && o.side && Number.isFinite(o.notional));
}

export function RebalanceSimulatePanel({ title, defaultRequest }: Props) {
  const [requestText, setRequestText] = useState(() => pretty(defaultRequest));
  const [loading, setLoading] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<unknown>(null);

  const parsedReq = useMemo(() => safeJsonParse(requestText), [requestText]);

  const orders = useMemo(() => {
    if (!response || typeof response !== "object") return [];
    const r = response as any;
    return normalizeOrders(r.orders);
  }, [response]);

  const explain = useMemo(() => {
    if (!response || typeof response !== "object") return null;
    const r = response as any;
    if (r.explain === undefined || r.explain === null) return null;
    return r.explain as unknown;
  }, [response]);

  const warnings = useMemo(() => {
    if (!response || typeof response !== "object") return [];
    const r = response as any;
    if (!Array.isArray(r.warnings)) return [];
    return r.warnings.map(String);
  }, [response]);

  const targetWeights = useMemo(() => {
    // Prefer weights returned by the engine if present; otherwise show the input allocations.
    if (response && typeof response === "object") {
      const r = response as any;

      const raw = r.targetWeights ?? r.target_weights;
      if (Array.isArray(raw)) {
        return raw
          .filter(Boolean)
          .map((a: any) => ({
            id: String(a?.id ?? a?.symbol ?? ""),
            label: String(a?.label ?? a?.name ?? a?.id ?? a?.symbol ?? ""),
            targetPct: Number(a?.targetPct ?? a?.target_pct ?? a?.weight ?? 0),
          }))
          .filter((a) => a.id && a.label && Number.isFinite(a.targetPct));
      }

      if (raw && typeof raw === "object") {
        return Object.entries(raw as Record<string, unknown>)
          .map(([id, targetPct]) => ({ id, label: id, targetPct: Number(targetPct ?? 0) }))
          .filter((a) => a.id && Number.isFinite(a.targetPct));
      }
    }

    if (!parsedReq.ok) return [];
    const req = parsedReq.value as any;
    const allocs = req?.money_plan?.allocations;
    if (!Array.isArray(allocs)) return [];
    return allocs
      .filter(Boolean)
      .map((a: any) => ({ id: String(a?.id ?? ""), label: String(a?.label ?? ""), targetPct: Number(a?.targetPct ?? 0) }))
      .filter((a) => a.id && a.label && Number.isFinite(a.targetPct));
  }, [parsedReq, response]);

  async function run() {
    setLoading(true);
    setError(null);
    setResponse(null);
    setHttpStatus(null);

    const parsed = safeJsonParse(requestText);
    if (!parsed.ok) {
      setLoading(false);
      setError(parsed.error);
      return;
    }

    try {
      const res = await fetch("/api/daa/rebalance/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestText,
      });

      setHttpStatus(res.status);
      const text = await res.text();
      const maybeJson = safeJsonParse(text);
      if (maybeJson.ok) {
        setResponse(maybeJson.value);
      } else {
        setResponse({ raw: text });
      }

      if (!res.ok) {
        setError(`HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const canCopyReq = parsedReq.ok;
  const canCopyResp = !!response;

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setRequestText(pretty(defaultRequest))}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            Reset sample
          </button>
          <button
            onClick={run}
            disabled={loading || !parsedReq.ok}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              opacity: loading || !parsedReq.ok ? 0.5 : 1,
            }}
          >
            {loading ? "Running..." : "Generate recommendation"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Request payload (JSON)</div>
            <button
              disabled={!canCopyReq}
              onClick={() => navigator.clipboard.writeText(requestText)}
              style={{
                padding: "4px 8px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                opacity: canCopyReq ? 1 : 0.5,
                fontSize: 12,
              }}
            >
              Copy
            </button>
          </div>
          <textarea
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            rows={14}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 6,
              fontFamily: "ui-monospace, SFMono-Regular",
            }}
          />
          {!parsedReq.ok ? <div style={{ fontSize: 12, color: "#b00020", marginTop: 6 }}>{parsedReq.error}</div> : null}
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              Response {httpStatus !== null ? <span style={{ color: "#666" }}>(HTTP {httpStatus})</span> : null}
            </div>
            <button
              disabled={!canCopyResp}
              onClick={() => navigator.clipboard.writeText(pretty(response))}
              style={{
                padding: "4px 8px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                opacity: canCopyResp ? 1 : 0.5,
                fontSize: 12,
              }}
            >
              Copy JSON
            </button>
          </div>

          {error ? <div style={{ fontSize: 12, color: "#b00020", marginBottom: 6 }}>{error}</div> : null}

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Recommended actions (orders)</div>
              {orders.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Symbol</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Side</th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Notional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: "6px 0" }}>{o.symbol}</td>
                        <td style={{ padding: "6px 0" }}>{o.side}</td>
                        <td style={{ padding: "6px 0", textAlign: "right" }}>{o.notional.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: 12, color: "#666" }}>No orders.</div>
              )}
              {orders.some((o) => o.reason) ? (
                <div style={{ marginTop: 8, fontSize: 12, color: "#444" }}>
                  {orders
                    .filter((o) => o.reason)
                    .slice(0, 3)
                    .map((o, idx) => (
                      <div key={idx} style={{ marginTop: idx ? 6 : 0 }}>
                        <span style={{ fontWeight: 600 }}>{o.symbol}</span>: {o.reason}
                      </div>
                    ))}
                </div>
              ) : null}
            </div>

            <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Target weights</div>
              {targetWeights.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Asset</th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetWeights.map((a, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: "6px 0" }}>
                          {a.label} <span style={{ color: "#999" }}>({a.id})</span>
                        </td>
                        <td style={{ padding: "6px 0", textAlign: "right" }}>{(a.targetPct * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: 12, color: "#666" }}>No allocations.</div>
              )}
            </div>

            <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Explanation (why)</div>
              {warnings.length ? (
                <div style={{ fontSize: 12, color: "#b00020", marginBottom: 6 }}>
                  Warnings: {warnings.join("; ")}
                </div>
              ) : null}
              {explain ? (
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {typeof explain === "string" ? explain : pretty(explain)}
                </pre>
              ) : (
                <div style={{ fontSize: 12, color: "#666" }}>No explain.</div>
              )}
            </div>

            <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Raw JSON</div>
              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {pretty(response || {})}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
