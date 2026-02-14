'use client';

import { useEffect, useMemo, useState } from 'react';

import { loadPaperExecutionLog, type PaperExecutionLogEntryV0 } from '@/src/daa/executionLogStore';
import { buildDynamicRebalanceRunAuditLogCsvV0 } from '@/src/daa/dynamicRebalanceRunExportV0';
import { buildRebalanceOrderReceiptsV1 } from '@/src/daa/rebalanceOrderReceiptsExportV1';
import { buildLatestRebalanceRunReportV1 } from '@/src/daa/rebalanceReportExport';
import { encodeRebalanceRunReportToShareToken } from '@/src/daa/rebalanceRunShareCodec';
import { loadRebalanceLog, type RebalanceLogEntryV0 } from '@/src/daa/rebalanceLogStore';
import {
  loadRebalanceOrderStatusRunHistoryV0,
  setRebalanceOrderStatusRunMetaV0,
  type RebalanceOrderStatusRunV0,
} from '@/src/daa/rebalanceOrderStatusRunStoreV0';

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
  const [shareStatus, setShareStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const [metaDraftByRunId, setMetaDraftByRunId] = useState<Record<string, { notes: string; tagsText: string }>>({});
  const [metaSaveByRunId, setMetaSaveByRunId] = useState<Record<string, 'idle' | 'ok' | 'error'>>({});

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
  const allExec = useMemo(() => (typeof window === 'undefined' ? [] : loadPaperExecutionLog(window.localStorage)), [rev]);
  const statusHistory = useMemo(() => (typeof window === 'undefined' ? [] : loadRebalanceOrderStatusRunHistoryV0(window.localStorage)), [rev]);

  const execByRunId = useMemo(() => {
    const m = new Map<string, PaperExecutionLogEntryV0>();
    const bestMs = new Map<string, number>();

    for (const e of allExec) {
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
  }, [allExec]);

  const statusByRunId = useMemo(() => {
    const m = new Map<string, RebalanceOrderStatusRunV0>();
    const bestMs = new Map<string, number>();

    for (const r of statusHistory) {
      const runId = typeof r?.runId === 'string' && r.runId ? r.runId : null;
      if (!runId) continue;
      const ms = Date.parse(String(r.updatedAt ?? ''));
      if (!Number.isFinite(ms)) continue;

      const prev = bestMs.get(runId);
      if (prev === undefined || ms >= prev) {
        bestMs.set(runId, ms);
        m.set(runId, r);
      }
    }

    return m;
  }, [statusHistory]);

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

  async function copyShareLink() {
    try {
      const report = buildLatestRebalanceRunReportV1(window.localStorage);
      const token = encodeRebalanceRunReportToShareToken(report);
      const url = `${window.location.origin}/daa/share#t=${token}`;
      await copyTextToClipboard(url);
      setShareStatus('ok');
      window.setTimeout(() => setShareStatus('idle'), 1200);
    } catch {
      setShareStatus('error');
      window.setTimeout(() => setShareStatus('idle'), 2000);
    }
  }

  function normalizeTagsText(tagsText: string): string[] {
    const raw = typeof tagsText === 'string' ? tagsText : String(tagsText ?? '');

    const parts = raw
      .split(/[,;\n]/g)
      .map((p) => p.trim())
      .filter(Boolean);

    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of parts) {
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= 24) break;
    }

    return out;
  }

  function getDraftForRun(args: { runId: string; statusRun: RebalanceOrderStatusRunV0 | null }): { notes: string; tagsText: string } {
    const existing = metaDraftByRunId[args.runId];
    if (existing) return existing;

    const notes = args.statusRun?.meta?.notes ?? '';
    const tagsText = (args.statusRun?.meta?.tags ?? []).join(', ');
    return { notes, tagsText };
  }

  function saveMeta(args: { runId: string; statusRun: RebalanceOrderStatusRunV0 | null }) {
    if (typeof window === 'undefined') return;

    const draft = getDraftForRun(args);
    const res = setRebalanceOrderStatusRunMetaV0({
      storage: window.localStorage,
      runId: args.runId,
      meta: {
        notes: draft.notes,
        tags: normalizeTagsText(draft.tagsText),
      },
    });

    setMetaSaveByRunId((m) => ({ ...m, [args.runId]: res.ok ? 'ok' : 'error' }));
    window.setTimeout(
      () => setMetaSaveByRunId((m) => ({ ...m, [args.runId]: 'idle' })),
      res.ok ? 1200 : 2000,
    );

    if (res.ok) window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
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

          <button type="button" className="button secondary" onClick={copyShareLink} style={{ padding: '6px 10px' }} disabled={!all.length}>
            {shareStatus === 'ok' ? 'Link copied' : shareStatus === 'error' ? 'Copy failed' : 'Copy share link'}
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

            const runId = typeof e.runId === 'string' && e.runId ? e.runId : null;
            const execEntry = runId ? execByRunId.get(runId) ?? null : null;
            const statusRun = runId ? statusByRunId.get(runId) ?? null : null;

            const metaDraft = runId ? getDraftForRun({ runId, statusRun }) : null;
            const metaSave = runId ? metaSaveByRunId[runId] ?? 'idle' : 'idle';

            const execOrders = execEntry?.orders ?? [];
            const statusOrders = statusRun?.orders ?? [];
            const filledCount = statusOrders.filter((o) => o.status === 'filled').length;
            const failedCount = statusOrders.filter((o) => o.status === 'failed').length;

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

                    {statusRun?.meta?.tags?.length ? (
                      <span className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular' }}>
                        tags: {statusRun.meta.tags.slice(0, 6).join(', ')}
                        {statusRun.meta.tags.length > 6 ? '…' : ''}
                      </span>
                    ) : null}

                    <span className="muted" style={{ fontSize: 12 }}>
                      orders: <b>{orders.length}</b> · exec: <b>{execOrders.length}</b>
                      {statusRun ? (
                        <>
                          {' '}· status: <b>{statusRun.state}</b> (filled <b>{filledCount}</b>, failed <b>{failedCount}</b>)
                        </>
                      ) : null}
                      {equity ? (
                        <>
                          {' '}· equity: <b>{equity.toFixed(2)}</b>
                        </>
                      ) : null}
                      {runId ? (
                        <>
                          {' '}· runId: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{runId.slice(0, 8)}</span>
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

                    {statusRun ? (
                      <>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                            const receipts = buildRebalanceOrderReceiptsV1({ run: statusRun });
                            downloadTextAsFile({
                              filename: `daa-order-receipts-${statusRun.runId.slice(0, 8)}-${stamp}.json`,
                              text: pretty(receipts),
                              mime: 'application/json',
                            });
                          }}
                          style={{ padding: '6px 10px' }}
                        >
                          Export receipts
                        </button>

                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                            const csv = buildDynamicRebalanceRunAuditLogCsvV0({ run: statusRun, coreLogEntry: e });
                            downloadTextAsFile({
                              filename: `daa-dynamic-rebalance-audit-${statusRun.runId.slice(0, 8)}-${stamp}.csv`,
                              text: csv,
                              mime: 'text/csv',
                            });
                          }}
                          style={{ padding: '6px 10px' }}
                        >
                          Export audit CSV
                        </button>
                      </>
                    ) : null}

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
                    {statusRun && runId && metaDraft ? (
                      <div style={{ border: '1px dashed rgba(255,255,255,0.18)', borderRadius: 12, padding: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>Run notes & tags</div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            {metaSave === 'ok' ? 'Saved' : metaSave === 'error' ? 'Save failed' : ' '}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                          <label className="muted" style={{ fontSize: 12, display: 'grid', gap: 6 }}>
                            Notes
                            <textarea
                              value={metaDraft.notes}
                              onChange={(ev) =>
                                setMetaDraftByRunId((m) => ({
                                  ...m,
                                  [runId]: { notes: ev.target.value, tagsText: metaDraft.tagsText },
                                }))
                              }
                              rows={3}
                              style={{ width: '100%', fontSize: 12, padding: 8, borderRadius: 10 }}
                              placeholder="What happened? Why this run?"
                            />
                          </label>

                          <label className="muted" style={{ fontSize: 12, display: 'grid', gap: 6 }}>
                            Tags (comma-separated)
                            <input
                              value={metaDraft.tagsText}
                              onChange={(ev) =>
                                setMetaDraftByRunId((m) => ({
                                  ...m,
                                  [runId]: { notes: metaDraft.notes, tagsText: ev.target.value },
                                }))
                              }
                              style={{ width: '100%', fontSize: 12, padding: 8, borderRadius: 10 }}
                              placeholder="e.g. okx, drift, cooldown, cash-buffer"
                            />
                          </label>

                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                            <button type="button" className="button" onClick={() => saveMeta({ runId, statusRun })} style={{ padding: '6px 10px' }}>
                              Save notes/tags
                            </button>
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() =>
                                setMetaDraftByRunId((m) => ({
                                  ...m,
                                  [runId]: {
                                    notes: statusRun.meta?.notes ?? '',
                                    tagsText: (statusRun.meta?.tags ?? []).join(', '),
                                  },
                                }))
                              }
                              style={{ padding: '6px 10px' }}
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

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

                    {statusRun || execEntry ? (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Executed trades</div>

                        {runId ? (
                          <div className="muted" style={{ fontSize: 11, marginBottom: 6, fontFamily: 'ui-monospace, SFMono-Regular' }}>
                            runId={runId}
                          </div>
                        ) : null}

                        {statusRun ? (
                          <>
                            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
                              state=<b>{statusRun.state}</b> · phase={statusRun.phase}
                              {statusRun.message ? (
                                <>
                                  {' '}· {statusRun.message}
                                </>
                              ) : null}
                              {statusRun.error ? (
                                <>
                                  {' '}· <span style={{ color: 'var(--danger)' }}>error: {statusRun.error}</span>
                                </>
                              ) : null}
                            </div>

                            {statusOrders.length ? (
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
                                    {statusOrders.map((o) => (
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
                                No orders recorded in status snapshot.
                              </div>
                            )}

                            <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                              <button type="button" className="button secondary" onClick={() => copyJson(pretty(statusRun))} style={{ padding: '6px 10px' }}>
                                Copy status JSON
                              </button>
                            </div>
                          </>
                        ) : execEntry && execOrders.length ? (
                          <>
                            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
                              executionLog: source={execEntry.source}
                            </div>

                            <div style={{ overflowX: 'auto' as const }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Symbol</th>
                                    <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Side</th>
                                    <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Notional</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {execOrders.map((o, idx) => (
                                    <tr key={`${o.symbol}-${idx}`} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                      <td style={{ padding: '6px 0' }}>{o.symbol}</td>
                                      <td style={{ padding: '6px 0' }}>{o.side}</td>
                                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{o.notional.toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                              <button type="button" className="button secondary" onClick={() => copyJson(pretty(execEntry))} style={{ padding: '6px 10px' }}>
                                Copy execution JSON
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="muted" style={{ fontSize: 11 }}>
                            No execution snapshot recorded.
                          </div>
                        )}
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
