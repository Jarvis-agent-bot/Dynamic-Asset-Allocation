'use client';

import { useEffect, useMemo, useState } from 'react';

import { buildLatestRebalanceRunReportV1 } from '@/src/daa/rebalanceReportExport';
import { loadRebalanceLog, type RebalanceLogEntryV0 } from '@/src/daa/rebalanceLogStore';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { WIZARD_DATA_EVENT, pretty } from '../../../wizardStorage';

const PAPER_RUN_NOTE = 'ui:market/funds:paper-run';

function downloadTextAsFile(args: { filename: string; text: string; mime: string }) {
  try {
    const blob = new Blob([args.text], { type: args.mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = args.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Give the click a tick before cleanup.
    window.setTimeout(() => URL.revokeObjectURL(url), 250);
  } catch {
    // ignore
  }
}

function safeNum(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function extractOrders(x: unknown): { symbol: string; side: string; notional: number; reason?: string }[] {
  if (!x || typeof x !== 'object') return [];
  const r: any = x as any;
  const arr = r?.orders ?? r?.result?.orders;
  if (!Array.isArray(arr)) return [];

  return arr
    .map((o: any) => {
      const symbol = String(o?.symbol ?? '').trim();
      const side = String(o?.side ?? '').trim();
      const notional = safeNum(o?.notional);
      const reason = o?.reason === undefined ? undefined : String(o.reason);
      if (!symbol || !side || notional === null) return null;
      return reason === undefined ? { symbol, side, notional } : { symbol, side, notional, reason };
    })
    .filter(Boolean) as any;
}

type WeightRow = {
  id: string;
  label: string;
  currentPct: number;
  targetPct: number;
  deltaPct: number;
};

function extractWeightRows(resp: unknown): { rows: WeightRow[]; equity: number | null } {
  if (!resp || typeof resp !== 'object') return { rows: [], equity: null };

  const r: any = resp as any;
  const explain = r?.explain;
  const equity = safeNum(explain?.equity);
  if (!equity || equity <= 0) return { rows: [], equity: null };

  const currentValues: Record<string, number> =
    explain?.currentValues && typeof explain.currentValues === 'object' && !Array.isArray(explain.currentValues) ? (explain.currentValues as any) : {};
  const desiredValues: Record<string, number> =
    explain?.desiredValues && typeof explain.desiredValues === 'object' && !Array.isArray(explain.desiredValues) ? (explain.desiredValues as any) : {};

  const labels: Record<string, string> = {};
  if (Array.isArray(r?.targetWeights)) {
    for (const w of r.targetWeights) {
      const id = String((w as any)?.id ?? '').trim();
      if (!id) continue;
      const label = String((w as any)?.label ?? id).trim() || id;
      labels[id] = label;
    }
  }

  const ids = new Set<string>([...Object.keys(currentValues), ...Object.keys(desiredValues), ...Object.keys(labels)]);

  const rows: WeightRow[] = [];
  for (const id of ids) {
    const curV = safeNum((currentValues as any)[id]) ?? 0;
    const desV = safeNum((desiredValues as any)[id]) ?? 0;

    const currentPct = curV / equity;
    const targetPct = desV / equity;

    // Filter out pure zeros to keep the table readable.
    if (!(Math.abs(currentPct) > 1e-9 || Math.abs(targetPct) > 1e-9)) continue;

    rows.push({
      id,
      label: labels[id] ?? id,
      currentPct,
      targetPct,
      deltaPct: currentPct - targetPct,
    });
  }

  rows.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct) || a.id.localeCompare(b.id));
  return { rows, equity };
}

export default function DaaRebalanceLogViewV0() {
  const [rev, setRev] = useState(0);
  const [limit, setLimit] = useState(10);
  const [showAllSources, setShowAllSources] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    const onData = () => setRev((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData as EventListener);
    window.addEventListener('storage', onData);
    return () => {
      window.removeEventListener(WIZARD_DATA_EVENT, onData as EventListener);
      window.removeEventListener('storage', onData);
    };
  }, []);

  const all = useMemo(() => (typeof window === 'undefined' ? [] : loadRebalanceLog(window.localStorage)), [rev]);

  const filtered = useMemo(() => {
    if (showAllSources) return all;

    // Paper-run entries are recorded from Market/Funds only.
    const paperOnly = all.filter((e) => e.note === PAPER_RUN_NOTE);
    if (paperOnly.length) return paperOnly;

    // Backward compatibility: older runs used note="portfolio.lastRebalance".
    return all.filter((e) => e.source === 'core');
  }, [all, showAllSources]);

  const visible = useMemo(() => {
    const newestFirst = [...filtered].reverse();
    return newestFirst.slice(0, Math.max(1, Math.min(200, limit)));
  }, [filtered, limit]);

  async function copyJson(text: string) {
    try {
      await copyTextToClipboard(text);
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  const emptyHint = showAllSources
    ? 'No rebalance log entries yet.'
    : 'No paper rebalance runs recorded yet. Click “Run paper rebalance” above (trigger policy must be true to record).';

  return (
    <section style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
        <div>
          <div style={{ fontWeight: 800 }}>Paper rebalance log v0</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            最近 N 次 paper rebalance（trigger/weights/orders）。支持 Copy / Export（.json）与导出最近一次 run report（schemaVersioned）。
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            Limit
            <select
              value={String(limit)}
              onChange={(e) => setLimit(Math.max(1, Number(e.target.value)))}
              style={{ fontSize: 12, padding: '4px 6px', borderRadius: 8 }}
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={showAllSources} onChange={(e) => setShowAllSources(e.target.checked)} />
            Show all rebalance log
          </label>

          <button type="button" className="button secondary" onClick={() => copyJson(pretty(visible))} style={{ padding: '6px 10px' }} disabled={!visible.length}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy visible JSON'}
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={() =>
              downloadTextAsFile({
                filename: `daa-paper-rebalance-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
                text: pretty(visible),
                mime: 'application/json',
              })
            }
            style={{ padding: '6px 10px' }}
            disabled={!visible.length}
          >
            Export .json
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={() => {
              const report = buildLatestRebalanceRunReportV1(window.localStorage);
              downloadTextAsFile({
                filename: `daa-rebalance-run-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
                text: pretty(report),
                mime: 'application/json',
              });
            }}
            style={{ padding: '6px 10px' }}
            disabled={!all.length}
          >
            Export last run report
          </button>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Total stored: <b>{all.length}</b> · Showing: <b>{visible.length}</b>
      </div>

      {!visible.length ? <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        {emptyHint}
      </div> : null}

      {visible.length ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {visible.map((e) => {
            const resp: any = e.response as any;
            const trigger = resp?.trigger;
            const should = !!trigger?.shouldRebalance;
            const reasons = Array.isArray(trigger?.reasons) ? (trigger.reasons as any[]).map((x) => String(x)) : [];
            const stats = trigger?.stats;

            const orders = extractOrders(e.response);
            const { rows: weightRows, equity } = extractWeightRows(e.response);
            const topWeights = weightRows.slice(0, 8);

            const isOpen = !!expanded[e.id];
            const badgeBg = should ? '#0a7' : '#666';

            return (
              <div key={e.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' as const }}>
                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular', fontSize: 12 }}>{e.at}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: badgeBg, color: '#fff' }}>
                      {e.source}
                    </span>
                    {e.note ? (
                      <span className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular' }}>
                        {e.note}
                      </span>
                    ) : null}
                    <span className="muted" style={{ fontSize: 12 }}>
                      orders: <b>{orders.length}</b>
                      {equity ? (
                        <>
                          {' '}· equity: <b>{equity.toFixed(2)}</b>
                        </>
                      ) : null}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                    <button type="button" className="button secondary" onClick={() => copyJson(pretty(e))} style={{ padding: '6px 10px' }}>
                      Copy entry
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        downloadTextAsFile({
                          filename: `daa-paper-rebalance-${e.at.replace(/[:]/g, '-')}-${e.id}.json`,
                          text: pretty(e),
                          mime: 'application/json',
                        })
                      }
                      style={{ padding: '6px 10px' }}
                    >
                      Export
                    </button>
                    <button type="button" className="button" onClick={() => setExpanded((m) => ({ ...m, [e.id]: !isOpen }))} style={{ padding: '6px 10px' }}>
                      {isOpen ? 'Hide' : 'Details'}
                    </button>
                  </div>
                </div>

                {reasons.length ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Trigger: {should ? <b style={{ color: 'var(--primary)' }}>shouldRebalance=true</b> : <b>shouldRebalance=false</b>} ·{' '}
                    {reasons.join(' | ')}
                  </div>
                ) : null}

                {topWeights.length ? (
                  <div style={{ marginTop: 8, overflowX: 'auto' as const }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Asset</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Current</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Target</th>
                          <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topWeights.map((r) => {
                          const color = r.deltaPct > 0.01 ? 'var(--danger)' : r.deltaPct < -0.01 ? 'var(--primary)' : 'var(--text)';
                          return (
                            <tr key={r.id}>
                              <td style={{ padding: '6px 0' }}>
                                {r.label} <span className="muted">({r.id})</span>
                              </td>
                              <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.currentPct * 100).toFixed(1)}%</td>
                              <td style={{ padding: '6px 0', textAlign: 'right' }}>{(r.targetPct * 100).toFixed(1)}%</td>
                              <td style={{ padding: '6px 0', textAlign: 'right', color }}>{(r.deltaPct * 100).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {weightRows.length > topWeights.length ? (
                      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                        Showing top {topWeights.length} by |delta|. Use “Copy entry” to export full snapshot.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {isOpen ? (
                  <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                    {orders.length ? (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Orders</div>
                        <div style={{ overflowX: 'auto' as const }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Symbol</th>
                                <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Side</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Notional</th>
                                <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Why</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orders.map((o, idx) => (
                                <tr key={`${o.symbol}-${idx}`}>
                                  <td style={{ padding: '6px 0' }}>{o.symbol}</td>
                                  <td style={{ padding: '6px 0' }}>{o.side}</td>
                                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{o.notional.toFixed(2)}</td>
                                  <td style={{ padding: '6px 0' }} className="muted">
                                    {o.reason ?? ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                          <button type="button" className="button secondary" onClick={() => copyJson(pretty(orders))} style={{ padding: '6px 10px' }}>
                            Copy orders JSON
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {stats && typeof stats === 'object' ? (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Trigger stats</div>
                        <pre style={{ margin: 0, fontSize: 11, opacity: 0.85, overflowX: 'auto' }}>{pretty(stats)}</pre>
                      </div>
                    ) : null}

                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Raw entry</div>
                      <pre style={{ margin: 0, fontSize: 11, opacity: 0.85, overflowX: 'auto' }}>{pretty(e)}</pre>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
