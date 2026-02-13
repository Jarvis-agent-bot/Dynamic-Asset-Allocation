'use client';

import { useEffect, useMemo, useState } from 'react';

import { loadPortfolioStateV1 } from '../../../portfolioStateStore';
import { loadRebalanceScheduleStateV1 } from '../../../rebalanceScheduleStore';

import { computeNextRunAtLocalV0 } from '@/src/daa/rebalanceScheduleV0';

function formatLocalCompact(d: Date): string {
  // Keep a stable-ish format across browsers/locales.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

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

function safeParseIso(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export default function DaaDynamicRebalanceStatusPillV0(props: { rev?: number }) {
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

    const nextRunAt = schedule.enabled ? computeNextRunAtLocalV0(schedule, now) : null;

    // Treat the latest recorded rebalance execution (paper) as the last "evaluation" time.
    const portfolio = loadPortfolioStateV1();
    const lastEvalAt = safeParseIso(portfolio.lastRebalance?.at ?? null);

    return {
      nowMs: now.getTime(),
      enabled: !!schedule.enabled,
      nextRunAt,
      lastEvalAt,
    };
  }, [rev, tick]);

  const lastText = model.lastEvalAt ? formatLocalCompact(model.lastEvalAt) : '<none>';

  const nextAtText = model.enabled ? (model.nextRunAt ? formatLocalCompact(model.nextRunAt) : '<unknown>') : '<disabled>';
  const nextCountdown = model.enabled && model.nextRunAt ? formatCountdownCompactMs(model.nextRunAt.getTime() - model.nowMs) : '';
  const nextText = model.enabled && model.nextRunAt && nextCountdown ? `${nextAtText} (${nextCountdown})` : nextAtText;

  const statusColor = !model.enabled ? '#64748b' : model.nextRunAt ? '#22c55e' : '#f59e0b';
  const bg =
    !model.enabled ? 'rgba(100, 116, 139, 0.12)' : model.nextRunAt ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)';

  return (
    <span
      className="badge"
      title={`Dynamic rebalance status (local): enabled=${model.enabled}; lastEval=${lastText}; nextRun=${nextText}`}
      style={{ padding: '4px 8px', fontSize: 11, borderColor: statusColor, color: statusColor, background: bg }}
    >
      Dyn
      <span style={{ color: 'var(--muted)' }}>last eval: {lastText}</span>
      <span style={{ color: 'var(--muted)' }}>next: {nextText}</span>
    </span>
  );
}
