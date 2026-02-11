"use client";

import { useEffect, useMemo, useState } from "react";

import {
  LS_HUMAN_PROFILE,
  LS_MARKET_EVENTS,
  LS_MONEY_PLAN,
  LS_REBALANCE_REQUEST,
  LS_REBALANCE_RESPONSE,
  WIZARD_DATA_EVENT,
  pretty,
  readJsonFromLs,
} from "../wizardStorage";
import { LS_TAG_TAXONOMY, loadTagTaxonomy } from "../tagTaxonomy";

type SuggestedOrder = { symbol: string; side: string; notional: number; reason?: string };

type MarketEventLite = { id?: string; ts?: string; title?: string };

type HumanProfileLite = { id?: string; name?: string };

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

function extractSignals(req: unknown): Array<{ symbol: string; action: string; score?: number; reason?: string }> {
  if (!req || typeof req !== "object") return [];
  const r = req as any;
  if (!Array.isArray(r.signals)) return [];
  return r.signals
    .filter(Boolean)
    .map((s: any) => ({
      symbol: String(s?.symbol ?? ""),
      action: String(s?.action ?? ""),
      score: s?.score === undefined ? undefined : Number(s?.score),
      reason: s?.reason === undefined ? undefined : String(s?.reason),
    }))
    .filter((s: { symbol: string; action: string }) => s.symbol && s.action);
}

function asMarketEventLite(x: unknown): MarketEventLite {
  const e = x as any;
  return {
    id: e?.id === undefined ? undefined : String(e.id),
    ts: e?.ts === undefined ? undefined : String(e.ts),
    title: e?.title === undefined ? undefined : String(e.title),
  };
}

function asHumanProfileLite(x: unknown): HumanProfileLite {
  const p = x as any;
  return {
    id: p?.id === undefined ? undefined : String(p.id),
    name: p?.name === undefined ? undefined : String(p.name),
  };
}

export default function WizardPersistentSummary() {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const onData = () => setRev((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData as EventListener);
    // Keep in sync across multiple tabs.
    window.addEventListener("storage", onData);
    return () => {
      window.removeEventListener(WIZARD_DATA_EVENT, onData as EventListener);
      window.removeEventListener("storage", onData);
    };
  }, []);

  const moneyPlan = useMemo(() => readJsonFromLs(LS_MONEY_PLAN), [rev]);
  const rebalanceReq = useMemo(() => readJsonFromLs(LS_REBALANCE_REQUEST), [rev]);
  const rebalanceResp = useMemo(() => readJsonFromLs(LS_REBALANCE_RESPONSE), [rev]);

  const marketEvents = useMemo(() => readJsonFromLs(LS_MARKET_EVENTS), [rev]);
  const humanProfile = useMemo(() => readJsonFromLs(LS_HUMAN_PROFILE), [rev]);

  // Keep a "raw" read so we can decide whether Step7 has been configured,
  // but include the resolved taxonomy (with fallback default) in the copied bundle.
  const tagTaxonomyRaw = useMemo(() => readJsonFromLs(LS_TAG_TAXONOMY), [rev]);
  const tagTaxonomy = useMemo(() => loadTagTaxonomy(), [rev]);

  const signals = useMemo(() => extractSignals(rebalanceReq), [rebalanceReq]);

  const orders = useMemo(() => {
    if (!rebalanceResp || typeof rebalanceResp !== "object") return [];
    const r = rebalanceResp as any;
    return normalizeOrders(r.orders);
  }, [rebalanceResp]);

  const marketEventCount = useMemo(() => (Array.isArray(marketEvents) ? marketEvents.length : 0), [marketEvents]);
  const marketEventPreview = useMemo(() => {
    if (!Array.isArray(marketEvents) || !marketEvents.length) return [];
    return marketEvents.slice(0, 3).map(asMarketEventLite);
  }, [marketEvents]);

  const humanLite = useMemo(() => (humanProfile ? asHumanProfileLite(humanProfile) : null), [humanProfile]);

  const hasAny =
    !!moneyPlan ||
    !!rebalanceReq ||
    !!rebalanceResp ||
    (Array.isArray(marketEvents) && marketEvents.length > 0) ||
    !!humanProfile ||
    !!tagTaxonomyRaw;

  const bundle = useMemo(
    () => ({
      money_plan: moneyPlan,
      market_events: marketEvents,
      human_profile: humanProfile,
      tag_taxonomy: tagTaxonomy,
      signals,
      recommendation: rebalanceResp,
      rebalance_request: rebalanceReq,
    }),
    [moneyPlan, marketEvents, humanProfile, tagTaxonomy, signals, rebalanceResp, rebalanceReq]
  );

  if (!hasAny) {
    return (
      <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>跨 Step 持久化摘要</div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
          还没有可汇总的数据。先在 Step 2 填 events / Step 3 填资金计划，或在 Step 4/5 生成一次 recommendation。
        </div>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>跨 Step 持久化摘要</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            资金 / 事件 / 人因 / 标签 / 信号 / 建议结果 — refresh/切换 step 不丢
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            navigator.clipboard.writeText(
              pretty({
                schemaVersion: 1,
                generatedAt: new Date().toISOString(),
                ...bundle,
              })
            )
          }
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
        >
          Copy full JSON
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginTop: 10 }}>
        <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>资金（money plan）</div>
          {moneyPlan ? (
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(moneyPlan)}</pre>
          ) : (
            <div style={{ fontSize: 12, color: "#666" }}>No money plan yet.</div>
          )}
        </div>

        <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>市场事件（Step2 events）</div>
          {marketEventCount ? (
            <div style={{ fontSize: 12, color: "#444" }}>
              <div>{marketEventCount} events in localStorage.</div>
              {marketEventPreview.length ? (
                <div style={{ marginTop: 6, fontSize: 11, color: "#666" }}>
                  Latest preview: {marketEventPreview.map((e) => e.title || e.id).filter(Boolean).join(" / ")}
                </div>
              ) : null}
              <div style={{ marginTop: 6, fontSize: 11, color: "#666" }}>Tip: Step2 支持过滤/校验；Summary copy 包含全量列表。</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#666" }}>No events yet.</div>
          )}
        </div>

        <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>人因输入（Step6 profile）</div>
          {humanProfile ? (
            <div>
              <div style={{ fontSize: 12, color: "#444" }}>
                {humanLite?.name || "(unnamed)"} {humanLite?.id ? `(${humanLite.id})` : ""}
              </div>
              <pre style={{ margin: "6px 0 0", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(humanProfile)}</pre>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#666" }}>No human profile yet.</div>
          )}
        </div>

        <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Tag taxonomy（Step7）</div>
          <div style={{ fontSize: 12, color: "#444" }}>
            {tagTaxonomy.tags.length} tags {tagTaxonomyRaw ? "(configured)" : "(default)"}: {tagTaxonomy.tags.map((t) => t.key).join(", ")}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "#666" }}>Tip: Step7 可编辑 taxonomy；Summary copy 包含完整 taxonomy JSON。</div>
        </div>

        <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>信号（signals）</div>
          {signals.length ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Symbol</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Action</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #eee", paddingBottom: 6 }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: "6px 0" }}>{s.symbol}</td>
                    <td style={{ padding: "6px 0" }}>{s.action}</td>
                    <td style={{ padding: "6px 0", textAlign: "right" }}>{s.score === undefined ? "" : s.score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 12, color: "#666" }}>No signals (from last rebalance request).</div>
          )}
        </div>

        <div style={{ border: "1px solid #f1f1f1", borderRadius: 8, padding: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>建议结果（recommendation）</div>
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
          ) : rebalanceResp ? (
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(rebalanceResp)}</pre>
          ) : (
            <div style={{ fontSize: 12, color: "#666" }}>No recommendation yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}
