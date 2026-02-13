'use client';

import { useEffect, useMemo, useState } from 'react';

import { loadPriceSnapshotV1 } from '../../../priceSnapshotStore';
import { loadRebalanceScheduleStateV1 } from '../../../rebalanceScheduleStore';

import { computeDynamicRebalancePauseReasonV0, formatShanghaiCompactV0 } from '@/src/daa/dynamicRebalancePausedReasonV0';

function formatCountdownCompactMs(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) return '';
  if (deltaMs <= 0) return 'due';

  const totalSec = Math.floor(deltaMs / 1000);
  const totalMin = Math.floor(totalSec / 60);

  if (totalMin < 1) return 'in <1m';

  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;

  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

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

  const nowMs = Date.now();
  const nextOpenCountdown =
    reason.kind === 'paused-market-closed' && reason.nextOpenAt
      ? formatCountdownCompactMs(reason.nextOpenAt.getTime() - nowMs)
      : '';

  const nextCloseCountdown =
    reason.kind === 'paused-market-closed' && reason.nextCloseAt
      ? formatCountdownCompactMs(reason.nextCloseAt.getTime() - nowMs)
      : '';

  const windowText =
    reason.kind === 'paused-market-closed' && reason.nextOpenAt && reason.nextCloseAt
      ? `${formatShanghaiCompactV0(reason.nextOpenAt)}–${formatShanghaiCompactV0(reason.nextCloseAt)} (Asia/Shanghai)`
      : '';

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

      {reason.kind === 'paused-market-closed' && nextOpenCountdown ? (
        <span className="muted" style={{ fontSize: 12 }}>
          (next open {nextOpenCountdown})
        </span>
      ) : null}

      {reason.kind === 'paused-market-closed' && windowText ? (
        <span className="muted" style={{ fontSize: 12 }}>
          · window {windowText}
        </span>
      ) : null}

      {reason.kind === 'paused-market-closed' && nextCloseCountdown ? (
        <span className="muted" style={{ fontSize: 12 }}>
          (closes {nextCloseCountdown})
        </span>
      ) : null}
    </div>
  );
}
