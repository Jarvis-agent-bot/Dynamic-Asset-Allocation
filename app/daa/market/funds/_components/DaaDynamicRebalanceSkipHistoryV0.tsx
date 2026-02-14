'use client';

import { useEffect, useMemo, useState } from 'react';

import { loadPortfolioStateV1 } from '../../../portfolioStateStore';
import { loadPriceSnapshotV1 } from '../../../priceSnapshotStore';
import { loadRebalanceScheduleStateV1 } from '../../../rebalanceScheduleStore';

import { computeDynamicRebalancePauseReasonV0 } from '@/src/daa/dynamicRebalancePausedReasonV0';
import {
  appendDynamicRebalanceSkipLogV0,
  clearDynamicRebalanceSkipLogV0,
  loadDynamicRebalanceSkipLogV0,
  type DynamicRebalanceSkipLogEntryV0,
} from '@/src/daa/dynamicRebalanceSkipLogStoreV0';
import { computeMostRecentScheduledAtLocalV0 } from '@/src/daa/rebalanceScheduleV0';

function safeParseIso(s: string | null): Date | null {
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

export default function DaaDynamicRebalanceSkipHistoryV0(props: { rev?: number }) {
  const { rev } = props;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const [entries, setEntries] = useState<DynamicRebalanceSkipLogEntryV0[]>([]);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const now = new Date();

    const scheduleSt = loadRebalanceScheduleStateV1();
    const schedule = scheduleSt.schedule;

    const lastScheduledAt = schedule.enabled ? computeMostRecentScheduledAtLocalV0(schedule, now) : null;

    // Treat the latest recorded rebalance execution (paper) as the last "evaluation" time.
    const portfolio = loadPortfolioStateV1();
    const lastEvalAt = safeParseIso(portfolio.lastRebalance?.at ?? null);

    if (schedule.enabled && lastScheduledAt && (!lastEvalAt || lastEvalAt.getTime() < lastScheduledAt.getTime())) {
      const cancelled = loadDynamicRebalanceSkipLogV0(window.localStorage).some(
        (e) => e.kind === 'user-cancelled' && e.at === lastScheduledAt.toISOString(),
      );

      if (!cancelled) {
        // Compute the pause reason at the scheduled tick time (not "now"), so the log reflects
        // the actual intended run window.
        const snapshot = loadPriceSnapshotV1();
        const priceCount = Object.keys(snapshot.prices ?? {}).length;

        const reason = computeDynamicRebalancePauseReasonV0({
          enabled: true,
          now: lastScheduledAt,
          priceSnapshotUpdatedAt: snapshot.updatedAt,
          priceCount,
          staleAfterMin: 60,
        });

        if (reason) {
          appendDynamicRebalanceSkipLogV0({
            storage: window.localStorage,
            at: lastScheduledAt.toISOString(),
            reason,
          });
        }
      }
    }

    setEntries(loadDynamicRebalanceSkipLogV0(window.localStorage));
  }, [rev, tick]);

  const view = useMemo(() => {
    const items = entries.slice(-5).reverse();
    return { items, total: entries.length };
  }, [entries]);

  if (!view.total) return null;

  async function doCopy() {
    try {
      setCopyStatus('idle');
      await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    }
  }

  function doClear() {
    if (typeof window === 'undefined') return;
    clearDynamicRebalanceSkipLogV0(window.localStorage);
    setEntries([]);
  }

  return (
    <div
      id="dyn-skip-history-v0"
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(100, 116, 139, 0.10)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const }}>
        <div style={{ fontWeight: 800 }}>Skip history v0</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <span className="muted" style={{ fontSize: 11 }}>
            last {Math.min(view.total, 5)} / total {view.total}
          </span>
          <button type="button" className="button secondary" onClick={doCopy} style={{ padding: '4px 8px', fontSize: 11 }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy JSON'}
          </button>
          <button type="button" className="button secondary" onClick={doClear} style={{ padding: '4px 8px', fontSize: 11 }}>
            Clear
          </button>
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
        {view.items.map((e) => {
          const at = safeParseIso(e.at);
          const recordedAt = safeParseIso(e.recordedAt);

          const atText = at ? formatLocalCompact(at) : e.at;
          const recText = recordedAt ? formatLocalCompact(recordedAt) : e.recordedAt;

          const kindText =
            e.kind === 'paused-market-closed'
              ? 'market closed'
              : e.kind === 'stalled-data-stale'
                ? 'price stale'
                : e.kind === 'user-cancelled'
                  ? 'user cancelled'
                  : e.kind;

          return (
            <div key={e.id} id={`dyn-skip-${e.id}`} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
              <span className="badge" style={{ padding: '2px 6px', fontSize: 10, borderColor: '#64748b', color: '#64748b', background: 'rgba(100, 116, 139, 0.10)' }}>
                {atText}
              </span>
              <span style={{ fontWeight: 700 }}>{e.title}</span>
              <span className="muted">({kindText})</span>
              <span className="muted" style={{ marginLeft: 6 }}>
                {e.detail}
              </span>
              <span className="muted" style={{ fontSize: 10 }} title={e.recordedAt}>
                recorded {recText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
