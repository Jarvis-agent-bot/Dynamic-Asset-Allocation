'use client';

import { useMemo } from 'react';

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

function safeParseIso(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export default function DaaDynamicRebalanceStatusPillV0(props: { rev?: number }) {
  const { rev } = props;

  const model = useMemo(() => {
    const scheduleSt = loadRebalanceScheduleStateV1();
    const schedule = scheduleSt.schedule;

    const nextRunAt = schedule.enabled ? computeNextRunAtLocalV0(schedule, new Date()) : null;

    // Treat the latest recorded rebalance execution (paper) as the last "evaluation" time.
    const portfolio = loadPortfolioStateV1();
    const lastEvalAt = safeParseIso(portfolio.lastRebalance?.at ?? null);

    return {
      enabled: !!schedule.enabled,
      nextRunAt,
      lastEvalAt,
    };
  }, [rev]);

  const lastText = model.lastEvalAt ? formatLocalCompact(model.lastEvalAt) : '<none>';
  const nextText = model.enabled ? (model.nextRunAt ? formatLocalCompact(model.nextRunAt) : '<unknown>') : '<disabled>';

  const statusColor = !model.enabled ? '#64748b' : model.nextRunAt ? '#22c55e' : '#f59e0b';
  const bg = !model.enabled ? 'rgba(100, 116, 139, 0.12)' : model.nextRunAt ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)';

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
