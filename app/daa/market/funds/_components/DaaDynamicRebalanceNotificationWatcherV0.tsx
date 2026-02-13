'use client';

import { useEffect } from 'react';

import { loadPortfolioStateV1 } from '../../../portfolioStateStore';
import { loadPriceSnapshotV1 } from '../../../priceSnapshotStore';
import { loadRebalanceScheduleStateV1 } from '../../../rebalanceScheduleStore';

import { pushDynamicRebalanceNotificationV0 } from '../../../dynamicRebalanceNotificationsClientV0';

import { computeDynamicRebalancePauseReasonV0 } from '@/src/daa/dynamicRebalancePausedReasonV0';
import { loadDynamicRebalanceNotifyPrefsStateV1 } from '@/src/daa/dynamicRebalanceNotificationPrefsStoreV0';
import { computeMostRecentScheduledAtLocalV0 } from '@/src/daa/rebalanceScheduleV0';

function safeParseIso(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatLocalCompact(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export default function DaaDynamicRebalanceNotificationWatcherV0(props: { rev?: number }) {
  const { rev } = props;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function tick() {
      try {
        const prefsState = loadDynamicRebalanceNotifyPrefsStateV1(window.localStorage);
        const prefs = prefsState.prefs;
        if (!prefs.enabled) return;

        const now = new Date();
        const scheduleSt = loadRebalanceScheduleStateV1();
        const schedule = scheduleSt.schedule;
        if (!schedule.enabled) return;

        const lastScheduledAt = computeMostRecentScheduledAtLocalV0(schedule, now);
        if (!lastScheduledAt) return;

        // Treat the latest recorded rebalance execution (paper) as the last "evaluation" time.
        const portfolio = loadPortfolioStateV1();
        const lastEvalAt = safeParseIso(portfolio.lastRebalance?.at ?? null);

        if (lastEvalAt && lastEvalAt.getTime() >= lastScheduledAt.getTime()) return;

        const snapshot = loadPriceSnapshotV1();
        const priceCount = Object.keys(snapshot.prices ?? {}).length;

        const reason = computeDynamicRebalancePauseReasonV0({
          enabled: true,
          now: lastScheduledAt,
          priceSnapshotUpdatedAt: snapshot.updatedAt,
          priceCount,
          staleAfterMin: 60,
        });

        // Prefer skip reasons when available/enabled, otherwise fall back to schedule-due.
        if (reason?.kind === 'paused-market-closed' && prefs.events.skipMarketClosed) {
          pushDynamicRebalanceNotificationV0({
            storage: window.localStorage,
            atIso: lastScheduledAt.toISOString(),
            kind: 'skip-market-closed',
            title: reason.title,
            body: reason.detail,
          });
          return;
        }

        if (reason?.kind === 'stalled-data-stale' && prefs.events.skipDataStale) {
          pushDynamicRebalanceNotificationV0({
            storage: window.localStorage,
            atIso: lastScheduledAt.toISOString(),
            kind: 'skip-data-stale',
            title: reason.title,
            body: reason.detail,
          });
          return;
        }

        if (prefs.events.scheduleDue) {
          pushDynamicRebalanceNotificationV0({
            storage: window.localStorage,
            atIso: lastScheduledAt.toISOString(),
            kind: 'schedule-due',
            title: 'Dynamic rebalance due',
            body: `Scheduled at ${formatLocalCompact(lastScheduledAt)} (local). Open Funds hub to run.`,
          });
        }
      } catch {
        // ignore
      }
    }

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [rev]);

  return null;
}
