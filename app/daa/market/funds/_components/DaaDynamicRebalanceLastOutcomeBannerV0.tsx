'use client';

import { useEffect, useMemo, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { WIZARD_DATA_EVENT, pretty } from '../../../wizardStorage';

import { loadDynamicRebalanceSkipLogV0, type DynamicRebalanceSkipLogEntryV0 } from '@/src/daa/dynamicRebalanceSkipLogStoreV0';
import { computeLastDynamicRebalanceOutcomeV0 } from '@/src/daa/dynamicRebalanceLastOutcomeV0';
import {
  loadRebalanceOrderStatusRunHistoryV0,
  type RebalanceOrderStatusRunV0,
} from '@/src/daa/rebalanceOrderStatusRunStoreV0';

const LS_DISMISSED_V0 = 'daa.market.funds.lastOutcomeBanner.dismissed.v0';

type DismissedV0 = {
  signature: string;
  dismissedAt: string;
};

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function loadDismissedV0(storage: Pick<Storage, 'getItem'>): DismissedV0 | null {
  const raw = safeJsonParse(storage.getItem(LS_DISMISSED_V0));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r: any = raw as any;
  const signature = typeof r.signature === 'string' ? r.signature : '';
  const dismissedAt = typeof r.dismissedAt === 'string' ? r.dismissedAt : '';
  if (!signature || !dismissedAt) return null;
  return { signature, dismissedAt };
}

function saveDismissedV0(storage: Pick<Storage, 'setItem'>, v: DismissedV0) {
  try {
    storage.setItem(LS_DISMISSED_V0, JSON.stringify(v));
  } catch {
    // ignore
  }
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function formatAgoCompact(iso: string): string {
  const ms = parseIsoMs(iso);
  if (ms === null) return '';
  const deltaSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.round(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaH = Math.round(deltaMin / 60);
  if (deltaH < 48) return `${deltaH}h ago`;
  const deltaD = Math.round(deltaH / 24);
  return `${deltaD}d ago`;
}

function pickHref(run: RebalanceOrderStatusRunV0 | undefined, skip: DynamicRebalanceSkipLogEntryV0 | undefined): string {
  if (skip) return `#dyn-skip-${encodeURIComponent(skip.id)}`;
  if (run) return `#dyn-run-${encodeURIComponent(run.runId)}`;
  return '#dyn-run-history-v0';
}

export default function DaaDynamicRebalanceLastOutcomeBannerV0(props: { rev?: number }) {
  const { rev } = props;

  const [localRev, setLocalRev] = useState(0);
  const [tick, setTick] = useState(0);
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

  // Keep the "ago" text fresh without needing storage writes.
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const model = useMemo(() => {
    if (typeof window === 'undefined') return null;

    const runs = loadRebalanceOrderStatusRunHistoryV0(window.localStorage);
    const skips = loadDynamicRebalanceSkipLogV0(window.localStorage);

    const last = computeLastDynamicRebalanceOutcomeV0({ runs, skips });
    if (!last) return null;

    const dismissed = loadDismissedV0(window.localStorage);
    if (dismissed && dismissed.signature === last.signature) return null;

    return last;
  }, [rev, localRev, tick]);

  if (!model) return null;

  const ui =
    model.kind === 'success'
      ? { border: '#34d399', bg: 'rgba(16, 185, 129, 0.10)', title: '#10b981', badgeBg: '#059669' }
      : model.kind === 'failure'
        ? { border: 'rgba(239, 68, 68, 0.55)', bg: 'rgba(239, 68, 68, 0.08)', title: 'var(--danger)', badgeBg: '#b91c1c' }
        : { border: 'rgba(245, 158, 11, 0.55)', bg: 'rgba(245, 158, 11, 0.10)', title: '#f59e0b', badgeBg: '#d97706' };

  const subtitleParts: string[] = [];
  if (model.run && model.summary && typeof model.summary.ordersTotal === 'number') {
    const t = model.summary.ordersTotal;
    const f = model.summary.ordersFailed ?? 0;
    const ok = model.summary.ordersFilled ?? 0;
    subtitleParts.push(`orders ${t} (filled ${ok}, failed ${f})`);
  }
  if (model.skip) {
    subtitleParts.push(model.skip.detail);
  }

  const ago = formatAgoCompact(model.atIso);
  if (ago) subtitleParts.push(ago);

  const subtitle = subtitleParts.filter(Boolean).join(' - ');

  const detailHref = pickHref(model.run, model.skip);

  async function doCopy() {
    try {
      if (typeof window === 'undefined') return;
      const current = model;
      if (!current) return;

      const payload = current.run ?? current.skip ?? current;
      await copyTextToClipboard(pretty(payload));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  function doDismiss() {
    if (typeof window === 'undefined') return;
    const current = model;
    if (!current) return;

    saveDismissedV0(window.localStorage, { signature: current.signature, dismissedAt: new Date().toISOString() });
    setLocalRev((x) => x + 1);
  }

  const label = model.kind === 'success' ? 'success' : model.kind === 'failure' ? 'failure' : 'canceled';
  const title =
    model.kind === 'success'
      ? 'Last dynamic rebalance: success'
      : model.kind === 'failure'
        ? 'Last dynamic rebalance: failed'
        : 'Last dynamic rebalance: canceled';

  return (
    <div
      role="status"
      aria-label="Last dynamic rebalance outcome"
      style={{
        marginTop: 8,
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${ui.border}`,
        background: ui.bg,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: ui.badgeBg, color: '#fff', fontWeight: 800 }}>
            {label}
          </span>
          <span style={{ fontWeight: 800, color: ui.title }}>{title}</span>
          {model.run ? (
            <span className="muted" style={{ fontSize: 11 }}>
              runId <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{model.run.runId.slice(0, 10)}</span>
            </span>
          ) : model.skip ? (
            <span className="muted" style={{ fontSize: 11 }}>
              skipId <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{model.skip.id.slice(0, 10)}</span>
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <a href={detailHref} className="button secondary" style={{ padding: '4px 8px', fontSize: 11 }}>
            View details
          </a>
          <button type="button" className="button secondary" onClick={doCopy} style={{ padding: '4px 8px', fontSize: 11 }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy JSON'}
          </button>
          <button type="button" className="button secondary" onClick={doDismiss} style={{ padding: '4px 8px', fontSize: 11 }}>
            Dismiss
          </button>
        </div>
      </div>

      {subtitle ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
          {subtitle}
        </div>
      ) : null}

      {model.kind === 'failure' && model.run?.error ? (
        <div style={{ fontSize: 11, marginTop: 6, color: '#fecaca', lineHeight: 1.5 }}>
          error: {model.run.error}
        </div>
      ) : null}
    </div>
  );
}
