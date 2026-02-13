'use client';

import { useEffect, useMemo, useState } from 'react';

import { loadPriceSnapshotV1 } from '../../../priceSnapshotStore';
import { loadRebalanceScheduleStateV1 } from '../../../rebalanceScheduleStore';

import { computeDynamicRebalancePauseReasonV0 } from '@/src/daa/dynamicRebalancePausedReasonV0';

export default function DaaDynamicRebalancePausedReasonBannerV0(props: { rev?: number }) {
  const { rev } = props;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const model = useMemo(() => {
    const now = new Date();

    const scheduleSt = loadRebalanceScheduleStateV1();
    const schedule = scheduleSt.schedule;

    const snapshot = loadPriceSnapshotV1();
    const priceCount = Object.keys(snapshot.prices ?? {}).length;

    const reason = computeDynamicRebalancePauseReasonV0({
      enabled: !!schedule.enabled,
      now,
      priceSnapshotUpdatedAt: snapshot.updatedAt,
      priceCount,
      staleAfterMin: 60,
    });

    return { reason };
  }, [rev, tick]);

  const reason = model.reason;
  if (!reason) return null;

  const ui =
    reason.kind === 'paused-market-closed'
      ? {
          border: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.12)',
          titleColor: '#92400e',
          detailColor: 'var(--muted)',
        }
      : {
          border: 'var(--danger)',
          bg: 'rgba(248, 113, 113, 0.12)',
          titleColor: 'var(--danger)',
          detailColor: 'var(--muted)',
        };

  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 12,
        border: `1px solid ${ui.border}`,
        background: ui.bg,
        fontSize: 12,
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontWeight: 700, color: ui.titleColor }}>{reason.title}</span>
      <span style={{ color: ui.detailColor }}>{reason.detail}</span>
    </div>
  );
}
