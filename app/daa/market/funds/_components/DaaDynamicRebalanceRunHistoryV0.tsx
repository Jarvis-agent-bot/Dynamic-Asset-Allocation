'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  loadRebalanceOrderStatusRunHistoryV0,
  type RebalanceOrderStatusRunV0,
} from '@/src/daa/rebalanceOrderStatusRunStoreV0';
import { loadRebalanceLog, type RebalanceLogEntryV0 } from '@/src/daa/rebalanceLogStore';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { WIZARD_DATA_EVENT, pretty } from '../../../wizardStorage';

type StateFilter = 'all' | 'done' | 'error' | 'running';
type OrderFilter = 'any' | 'has_failed' | 'all_filled';

function safeParseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatLocalCompact(d: Date): string {
  // Keep a stable-ish format across browsers/locales.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function computeCounts(run: RebalanceOrderStatusRunV0): { total: number; filled: number; failed: number } {
  const orders = Array.isArray(run?.orders) ? run.orders : [];
  const filled = orders.filter((o) => o?.status === 'filled').length;
  const failed = orders.filter((o) => o?.status === 'failed').length;
  return { total: orders.length, filled, failed };
}

function safeNum(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
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

export default function DaaDynamicRebalanceRunHistoryV0(props: { rev?: number }) {
  const { rev } = props;

  const [localRev, setLocalRev] = useState(0);
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('any');
  const [limit, setLimit] = useState(10);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    const onData = () => setLocalRev((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData as EventListener);
    window.addEventListener('storage', onData);
    return () => {
      window.removeEventListener(WIZARD_DATA_EVENT, onData as EventListener);
      window.removeEventListener('storage', onData);
    };
  }, []);

  // Allow deep-linking a run card from elsewhere in the Funds hub UI.
  // Example: #dyn-run-rebalance_run_<uuid>
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyHash = () => {
      const h = String(window.location.hash ?? '');
      if (!h.startsWith('#dyn-run-')) return;

      const runId = decodeURIComponent(h.slice('#dyn-run-'.length));
      if (!runId) return;

      // Ensure defaults so the targeted run is likely visible.
      setStateFilter('all');
      setOrderFilter('any');
      setLimit((v) => Math.max(v, 20));
      setExpanded((m) => ({ ...m, [runId]: true }));
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const all = useMemo(() => {
    if (typeof window === 'undefined') return [] as RebalanceOrderStatusRunV0[];
    // Best-effort history stored in localStorage.
    return loadRebalanceOrderStatusRunHistoryV0(window.localStorage);
  }, [rev, localRev]);

  const rebalanceLog = useMemo(() => {
    if (typeof window === 'undefined') return [] as RebalanceLogEntryV0[];
    return loadRebalanceLog(window.localStorage);
  }, [rev, localRev]);

  const logByRunId = useMemo(() => {
    const m = new Map<string, RebalanceLogEntryV0>();
    const bestMs = new Map<string, number>();

    for (const e of rebalanceLog) {
      const runId = typeof e?.runId === 'string' && e.runId ? e.runId : null;
      if (!runId) continue;
      const ms = Date.parse(String(e.at ?? ''));
      if (!Number.isFinite(ms)) continue;

      const prev = bestMs.get(runId);
      if (prev === undefined || ms >= prev) {
        bestMs.set(runId, ms);
        m.set(runId, e);
      }
    }

    return m;
  }, [rebalanceLog]);

  const normalized = useMemo(() => {
    const items = all
      .filter(Boolean)
      .map((r) => {
        const createdMs = Date.parse(String(r.createdAt ?? ''));
        const updatedMs = Date.parse(String(r.updatedAt ?? ''));
        return {
          run: r,
          createdMs: Number.isFinite(createdMs) ? createdMs : 0,
          updatedMs: Number.isFinite(updatedMs) ? updatedMs : 0,
        };
      });

    items.sort((a, b) => b.updatedMs - a.updatedMs || b.createdMs - a.createdMs);
    return items;
  }, [all]);

  const filtered = useMemo(() => {
    const byState = normalized.filter(({ run }) => {
      if (stateFilter === 'all') return true;
      return run.state === stateFilter;
    });

    const byOrders = byState.filter(({ run }) => {
      if (orderFilter === 'any') return true;
      const c = computeCounts(run);
      if (orderFilter === 'has_failed') return c.failed > 0;
      if (orderFilter === 'all_filled') return c.total > 0 && c.failed === 0 && c.filled === c.total;
      return true;
    });

    return byOrders;
  }, [normalized, stateFilter, orderFilter]);

  const visible = useMemo(() => {
    const lim = Math.max(1, Math.min(200, Number(limit) || 10));
    return filtered.slice(0, lim);
  }, [filtered, limit]);

  async function copyVisible() {
    try {
      await copyTextToClipboard(pretty(visible.map((x) => x.run)));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  if (!all.length) return null;

  return (
    <section style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
        <div>
          <div style={{ fontWeight: 800 }}>Dynamic rebalance run history v0</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            dynamic rebalance 的 order status run 历史（localStorage）。支持按 state / orders status 快速筛选。
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            State
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as StateFilter)}
              style={{ fontSize: 12, padding: '4px 6px', borderRadius: 8 }}
            >
              {(['all', 'done', 'error', 'running'] as const).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            Orders
            <select
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value as OrderFilter)}
              style={{ fontSize: 12, padding: '4px 6px', borderRadius: 8 }}
            >
              <option value="any">any</option>
              <option value="has_failed">has_failed</option>
              <option value="all_filled">all_filled</option>
            </select>
          </label>

          <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            Limit
            <select
              value={String(limit)}
              onChange={(e) => setLimit(Math.max(1, Number(e.target.value)))}
              style={{ fontSize: 12, padding: '4px 6px', borderRadius: 8 }}
            >
              {[5, 10, 20, 50, 100].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="button secondary" onClick={copyVisible} style={{ padding: '6px 10px' }} disabled={!visible.length}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy visible JSON'}
          </button>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Total stored: <b>{all.length}</b> · Filtered: <b>{filtered.length}</b> · Showing: <b>{visible.length}</b>
      </div>

      {visible.length ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {visible.map(({ run }) => {
            const createdAt = safeParseIso(run.createdAt);
            const updatedAt = safeParseIso(run.updatedAt);
            const createdText = createdAt ? formatLocalCompact(createdAt) : run.createdAt;
            const updatedText = updatedAt ? formatLocalCompact(updatedAt) : run.updatedAt;

            const c = computeCounts(run);

            const logEntry = logByRunId.get(run.runId) ?? null;
            const { rows: weightRows, equity } = extractWeightRows(logEntry?.response);
            const topWeights = weightRows.slice(0, 8);

            const key = run.runId;
            const isOpen = !!expanded[key];

            const badgeBg = run.state === 'done' ? '#0a7' : run.state === 'error' ? '#b91c1c' : '#666';

            return (
              <div key={key} id={`dyn-run-${run.runId}`} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: badgeBg, color: '#fff' }}>
                      {run.state}
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      phase={run.phase}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {createdText} → {updatedText}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      orders: <b>{c.total}</b> · filled <b>{c.filled}</b> · failed <b>{c.failed}</b>
                      {equity ? (
                        <>
                          {' '}· equity: <b>{equity.toFixed(2)}</b>
                        </>
                      ) : null}
                      {' '}· runId: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{run.runId.slice(0, 10)}</span>
                    </span>
                    {run.message ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        · {run.message}
                      </span>
                    ) : null}
                    {run.error ? (
                      <span style={{ fontSize: 12, color: 'var(--danger)' }}>
                        · error: {run.error}
                      </span>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        void copyTextToClipboard(pretty(run)).catch(() => {
                          // ignore
                        });
                      }}
                      style={{ padding: '6px 10px' }}
                    >
                      Copy
                    </button>
                    <button type="button" className="button" onClick={() => setExpanded((m) => ({ ...m, [key]: !isOpen }))} style={{ padding: '6px 10px' }}>
                      {isOpen ? 'Hide' : 'Details'}
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Timestamps</div>
                      <div className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular' }}>
                        createdAt={run.createdAt}; updatedAt={run.updatedAt}
                        {createdAt && updatedAt ? (
                          <>
                            ; duration~{Math.max(0, (updatedAt.getTime() - createdAt.getTime()) / 1000).toFixed(1)}s
                          </>
                        ) : null}
                      </div>
                    </div>

                    {topWeights.length ? (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Allocations (current vs target)</div>
                        <div style={{ overflowX: 'auto' as const }}>
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
                                  <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
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
                        </div>
                        {weightRows.length > topWeights.length ? (
                          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                            Showing top {topWeights.length} by |delta|. Use the buttons below to copy the full snapshot.
                          </div>
                        ) : null}
                        <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                          {logEntry ? (
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => {
                                void copyTextToClipboard(pretty(logEntry)).catch(() => {
                                  // ignore
                                });
                              }}
                              style={{ padding: '6px 10px' }}
                            >
                              Copy core entry
                            </button>
                          ) : null}
                          {logEntry ? (
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => {
                                void copyTextToClipboard(pretty(logEntry.response)).catch(() => {
                                  // ignore
                                });
                              }}
                              style={{ padding: '6px 10px' }}
                            >
                              Copy core response
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: 11 }}>
                        No allocation snapshot found for this runId yet. (Missing rebalance log entry)
                      </div>
                    )}

                    {Array.isArray(run.orders) && run.orders.length ? (
                      <div style={{ overflowX: 'auto' as const }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>#</th>
                              <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Symbol</th>
                              <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Side</th>
                              <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Notional</th>
                              <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Status</th>
                              <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Detail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {run.orders.map((o) => (
                              <tr key={o.id} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <td style={{ padding: '6px 0', fontFamily: 'ui-monospace, SFMono-Regular' }}>{o.id}</td>
                                <td style={{ padding: '6px 0' }}>{o.symbol}</td>
                                <td style={{ padding: '6px 0' }}>{o.side}</td>
                                <td style={{ padding: '6px 0', textAlign: 'right' }}>{o.notional.toFixed(2)}</td>
                                <td style={{ padding: '6px 0' }}>{o.status}</td>
                                <td style={{ padding: '6px 0' }} className="muted">
                                  {o.detail ?? ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="muted" style={{ fontSize: 11 }}>
                        No orders recorded in this run snapshot.
                      </div>
                    )}

                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Raw</div>
                      <pre style={{ margin: 0, fontSize: 11, opacity: 0.85, overflowX: 'auto' }}>{pretty(run)}</pre>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          No runs match the current filters.
        </div>
      )}
    </section>
  );
}
