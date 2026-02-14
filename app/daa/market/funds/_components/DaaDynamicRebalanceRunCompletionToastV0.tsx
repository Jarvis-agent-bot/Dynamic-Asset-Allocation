'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { loadRebalanceOrderStatusRunV0, type RebalanceOrderStatusRunV0 } from '@/src/daa/rebalanceOrderStatusRunStoreV0';

const LS_LAST_SHOWN_V0 = 'daa.market.funds.runCompletionToast.lastShown.v0';

type LastShownV0 = { runId: string; updatedAt: string };

type ToastV0 = {
  runId: string;
  updatedAt: string;
  state: 'done' | 'error';
  phase: string;
  message?: string;
  error?: string;
  counts: { total: number; filled: number; failed: number };
};

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function loadLastShownV0(storage: Pick<Storage, 'getItem'>): LastShownV0 | null {
  const raw = safeJsonParse(storage.getItem(LS_LAST_SHOWN_V0));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r: any = raw as any;
  const runId = typeof r.runId === 'string' ? r.runId : '';
  const updatedAt = typeof r.updatedAt === 'string' ? r.updatedAt : '';
  if (!runId || !updatedAt) return null;
  return { runId, updatedAt };
}

function persistLastShownV0(storage: Pick<Storage, 'setItem'>, v: LastShownV0) {
  try {
    storage.setItem(LS_LAST_SHOWN_V0, JSON.stringify(v));
  } catch {
    // ignore
  }
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function computeCounts(run: RebalanceOrderStatusRunV0): { total: number; filled: number; failed: number } {
  const orders = Array.isArray(run?.orders) ? run.orders : [];
  const filled = orders.filter((o) => o?.status === 'filled').length;
  const failed = orders.filter((o) => o?.status === 'failed').length;
  return { total: orders.length, filled, failed };
}

export function DaaDynamicRebalanceRunCompletionToastV0(props: { pollMs?: number; maxAgeMs?: number }) {
  const pollMs = Number.isFinite(props.pollMs) ? Math.max(250, Math.floor(props.pollMs as number)) : 750;
  const maxAgeMs = Number.isFinite(props.maxAgeMs) ? Math.max(10_000, Math.floor(props.maxAgeMs as number)) : 5 * 60_000;

  const [toast, setToast] = useState<ToastV0 | null>(null);
  const lastShownRef = useRef<LastShownV0 | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Cache last-shown so we can dedupe across reloads.
    lastShownRef.current = loadLastShownV0(window.localStorage);

    const read = () => {
      const snap = loadRebalanceOrderStatusRunV0(window.localStorage);
      if (!snap) return;
      if (snap.state !== 'done' && snap.state !== 'error') return;

      const updatedMs = parseIsoMs(snap.updatedAt);
      if (updatedMs !== null && Date.now() - updatedMs > maxAgeMs) return;

      const last = lastShownRef.current;
      if (last && last.runId === snap.runId && last.updatedAt === snap.updatedAt) return;

      const next: ToastV0 = {
        runId: snap.runId,
        updatedAt: snap.updatedAt,
        state: snap.state,
        phase: String(snap.phase ?? ''),
        message: snap.message,
        error: snap.error,
        counts: computeCounts(snap),
      };

      lastShownRef.current = { runId: snap.runId, updatedAt: snap.updatedAt };
      persistLastShownV0(window.localStorage, lastShownRef.current);
      setToast(next);
    };

    read();

    const id = window.setInterval(read, pollMs);
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== 'daa.rebalance.orderStatus.run.v0') return;
      read();
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', onStorage);
    };
  }, [pollMs, maxAgeMs]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 15_000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const ui = useMemo(() => {
    if (!toast) return null;

    const atMs = parseIsoMs(toast.updatedAt);
    const agoSec = atMs === null ? null : Math.max(0, Math.round((Date.now() - atMs) / 1000));

    const title = toast.state === 'done' ? 'Dynamic rebalance completed' : 'Dynamic rebalance failed';
    const badgeBg = toast.state === 'done' ? '#0a7' : '#b91c1c';

    const detailHref = `#dyn-run-${encodeURIComponent(toast.runId)}`;

    const countsText = toast.counts.total
      ? `orders ${toast.counts.total} (filled ${toast.counts.filled}, failed ${toast.counts.failed})`
      : 'orders 0';

    const subtitleParts: string[] = [];
    subtitleParts.push(countsText);
    if (agoSec !== null) subtitleParts.push(`${agoSec}s ago`);

    const subtitle = subtitleParts.join(' · ');
    return { title, badgeBg, detailHref, subtitle };
  }, [toast]);

  if (!toast || !ui) return null;

  return (
    <div
      role="status"
      aria-label="Dynamic rebalance run completed"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 1000,
        width: 380,
        maxWidth: 'calc(100vw - 32px)',
        borderRadius: 12,
        border: toast.state === 'done' ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.45)',
        background: 'rgba(15, 23, 42, 0.92)',
        color: '#fff',
        padding: '10px 12px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: ui.badgeBg, color: '#fff', fontWeight: 800 }}>
            {toast.state}
          </span>
          <div style={{ fontWeight: 800, fontSize: 12 }}>{ui.title}</div>
          <span style={{ fontSize: 11, opacity: 0.85 }}>phase={toast.phase}</span>
        </div>

        <button
          type="button"
          className="button secondary"
          onClick={() => setToast(null)}
          style={{ padding: '4px 8px', fontSize: 11 }}
          aria-label="Close"
        >
          Close
        </button>
      </div>

      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.9 }}>{ui.subtitle}</div>

      {toast.message ? (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85, lineHeight: 1.4 }}>msg: {toast.message}</div>
      ) : null}

      {toast.state === 'error' && toast.error ? (
        <div style={{ marginTop: 6, fontSize: 11, color: '#fecaca', lineHeight: 1.4 }}>error: {toast.error}</div>
      ) : null}

      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <a href={ui.detailHref} className="button" style={{ padding: '6px 10px', fontSize: 12 }}>
          View run details
        </a>
        <span style={{ fontSize: 11, opacity: 0.8 }}>
          runId <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{toast.runId.slice(0, 10)}</span>
        </span>
      </div>
    </div>
  );
}
