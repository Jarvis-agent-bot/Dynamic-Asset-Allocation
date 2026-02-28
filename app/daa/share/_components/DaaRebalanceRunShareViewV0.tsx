'use client';

import { useEffect, useMemo, useState } from 'react';

import type { RebalanceRunReportV1 } from '@/src/daa/rebalanceReportExport';
import {
  decodeRebalanceRunReportFromShareToken,
} from '@/src/daa/rebalanceRunShareCodec';

import { copyTextToClipboard } from '../../copyToClipboard';

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

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

    window.setTimeout(() => URL.revokeObjectURL(url), 250);
  } catch {
    // ignore
  }
}

function getTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;

  const fromSearch = new URLSearchParams(window.location.search).get('t');
  if (fromSearch) return fromSearch;

  const hash = String(window.location.hash || '');
  if (!hash || hash === '#') return null;

  // Allow both "#t=..." and "#t=...&x=y".
  const qs = hash.startsWith('#') ? hash.slice(1) : hash;
  const fromHash = new URLSearchParams(qs).get('t');
  if (fromHash) return fromHash;

  // Backward-compat parsing if someone copies "...#t=..." literally.
  if (qs.startsWith('t=')) return qs.slice(2) || null;

  return null;
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

export default function DaaRebalanceRunShareViewV0() {
  const [report, setReport] = useState<RebalanceRunReportV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    const token = getTokenFromLocation();
    if (!token) {
      setReport(null);
      setError('Missing token. Generate a share link from Unified Core > Paper rebalance log.');
      return;
    }

    const decoded = decodeRebalanceRunReportFromShareToken(token);
    if (!decoded) {
      setReport(null);
      setError('Invalid or unsupported token.');
      return;
    }

    setReport(decoded);
    setError(null);
  }, []);

  const runMeta = useMemo(() => {
    const entry = report?.run.rebalanceLogEntry ?? null;
    const exec = report?.run.paperExecutionLogEntry ?? null;
    const runId = (entry?.runId || exec?.runId || null) as string | null;
    const at = (entry?.at || exec?.at || report?.exportedAt || null) as string | null;
    const note = (entry?.note || exec?.note || null) as string | null;
    return { runId, at, note };
  }, [report]);

  const resp: any = report?.run.response as any;
  const trigger = resp?.trigger;
  const should = !!trigger?.shouldRebalance;
  const reasons = Array.isArray(trigger?.reasons) ? (trigger.reasons as any[]).map((x) => String(x)) : [];

  const orders = useMemo(() => extractOrders(resp), [resp]);
  const { rows: weightRows, equity } = useMemo(() => extractWeightRows(resp), [resp]);
  const topWeights = weightRows.slice(0, 12);

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

  if (error) {
    return (
      <section style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>No shared run loaded</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {error}
        </div>
      </section>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <section style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
        <div>
          <div style={{ fontWeight: 800 }}>Rebalance run summary</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            shouldRebalance={should ? <b style={{ color: 'var(--primary)' }}>true</b> : <b>false</b>}
            {runMeta.runId ? (
              <>
                {' '}· runId: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{runMeta.runId.slice(0, 12)}</span>
              </>
            ) : null}
            {equity ? (
              <>
                {' '}· equity: <b>{equity.toFixed(2)}</b>
              </>
            ) : null}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular' }}>
            at={runMeta.at ?? 'unknown'}{runMeta.note ? ` · note=${runMeta.note}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <button type="button" className="button secondary" onClick={() => copyJson(prettyJson(report))} style={{ padding: '6px 10px' }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy report JSON'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              downloadTextAsFile({
                filename: `daa-rebalance-run-share-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
                text: prettyJson(report),
                mime: 'application/json',
              })
            }
            style={{ padding: '6px 10px' }}
          >
            Download .json
          </button>
        </div>
      </div>

      {reasons.length ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Reasons: {reasons.join(' | ')}
        </div>
      ) : null}

      {orders.length ? (
        <div style={{ marginTop: 12 }}>
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
                  <tr key={`${o.symbol}-${idx}`} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
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
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>No orders in shared payload.</div>
      )}

      {topWeights.length ? (
        <div style={{ marginTop: 12, overflowX: 'auto' as const }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Top weights by |delta|</div>
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
      ) : null}

      {report.notes?.length ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Notes</div>
          <pre style={{ margin: 0, fontSize: 11, opacity: 0.85, overflowX: 'auto' }}>{prettyJson(report.notes)}</pre>
        </div>
      ) : null}
    </section>
  );
}
