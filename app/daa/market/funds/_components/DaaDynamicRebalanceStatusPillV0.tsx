'use client';

import { useEffect, useMemo, useState } from 'react';

import { loadPortfolioStateV1 } from '../../../portfolioStateStore';
import { loadRebalanceScheduleStateV1 } from '../../../rebalanceScheduleStore';

import { computeNextRunAtLocalV0 } from '@/src/daa/rebalanceScheduleV0';
import { computeNextCnMarketOpenShanghaiV0, isCnMarketOpenShanghaiV0 } from '@/src/daa/dynamicRebalancePausedReasonV0';

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

function getShanghaiParts(date: Date): { y: number; m1: number; d: number; hh: number; mm: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;

  const y = Number(get('year') ?? 1970);
  const m1 = Number(get('month') ?? 1);
  const d = Number(get('day') ?? 1);
  const hh = Number(get('hour') ?? 0);
  const mm = Number(get('minute') ?? 0);

  return {
    y: Number.isFinite(y) ? Math.trunc(y) : 1970,
    m1: Number.isFinite(m1) ? Math.trunc(m1) : 1,
    d: Number.isFinite(d) ? Math.trunc(d) : 1,
    hh: Number.isFinite(hh) ? Math.trunc(hh) : 0,
    mm: Number.isFinite(mm) ? Math.trunc(mm) : 0,
  };
}

function dateFromShanghaiLocal(args: { y: number; m1: number; d: number; hh: number; mm: number }): Date {
  // Asia/Shanghai is UTC+8 with no DST.
  return new Date(Date.UTC(args.y, args.m1 - 1, args.d, args.hh - 8, args.mm, 0, 0));
}

function computeShanghaiSessionWindowLabelV0(at: Date): { session: 'am' | 'pm'; label: string; closeAt: Date } | null {
  // Used as an "execution window" estimate for dynamic rebalance runs (CN hours only).
  const p = getShanghaiParts(at);
  const min = p.hh * 60 + p.mm;

  const am = min >= 9 * 60 + 30 && min < 11 * 60 + 30;
  const pm = min >= 13 * 60 && min < 15 * 60;

  if (am) {
    return {
      session: 'am',
      label: '09:30-11:30',
      closeAt: dateFromShanghaiLocal({ y: p.y, m1: p.m1, d: p.d, hh: 11, mm: 30 }),
    };
  }

  if (pm) {
    return {
      session: 'pm',
      label: '13:00-15:00',
      closeAt: dateFromShanghaiLocal({ y: p.y, m1: p.m1, d: p.d, hh: 15, mm: 0 }),
    };
  }

  return null;
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

    const scheduledNextRunAt = schedule.enabled ? computeNextRunAtLocalV0(schedule, now) : null;

    // CN market-hours constraint: estimate the *actual* next run window that can execute.
    const nextExecAt =
      schedule.enabled && scheduledNextRunAt
        ? isCnMarketOpenShanghaiV0(scheduledNextRunAt)
          ? scheduledNextRunAt
          : computeNextCnMarketOpenShanghaiV0(scheduledNextRunAt)
        : null;

    const session = nextExecAt ? computeShanghaiSessionWindowLabelV0(nextExecAt) : null;

    // Treat the latest recorded rebalance execution (paper) as the last "evaluation" time.
    const portfolio = loadPortfolioStateV1();
    const lastEvalAt = safeParseIso(portfolio.lastRebalance?.at ?? null);

    return {
      nowMs: now.getTime(),
      enabled: !!schedule.enabled,
      scheduledNextRunAt,
      nextExecAt,
      session,
      lastEvalAt,
    };
  }, [rev, tick]);

  const lastText = model.lastEvalAt ? formatLocalCompact(model.lastEvalAt) : '<none>';

  const nextAtText =
    model.enabled ? (model.nextExecAt ? formatLocalCompact(model.nextExecAt) : model.scheduledNextRunAt ? '<market-closed>' : '<unknown>') : '<disabled>';

  const nextCountdown =
    model.enabled && model.nextExecAt ? formatCountdownCompactMs(model.nextExecAt.getTime() - model.nowMs) : model.enabled && model.scheduledNextRunAt ? '' : '';

  const nextText = model.enabled && model.nextExecAt && nextCountdown ? `${nextAtText} (${nextCountdown})` : nextAtText;

  const windowText = model.session ? `${model.session.label} SH` : '';
  const closeCountdown = model.session ? formatCountdownCompactMs(model.session.closeAt.getTime() - model.nowMs) : '';

  const statusColor = !model.enabled ? '#64748b' : model.nextExecAt ? '#22c55e' : '#f59e0b';
  const bg =
    !model.enabled ? 'rgba(100, 116, 139, 0.12)' : model.nextExecAt ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)';

  const title =
    `Dynamic rebalance status (local): enabled=${model.enabled}; ` +
    `lastEval=${lastText}; ` +
    `scheduledNext=${model.scheduledNextRunAt ? formatLocalCompact(model.scheduledNextRunAt) : '<none>'}; ` +
    `nextExec=${model.nextExecAt ? formatLocalCompact(model.nextExecAt) : '<none>'}` +
    (windowText ? `; window=${windowText}` : '') +
    (closeCountdown ? `; closes ${closeCountdown}` : '');

  return (
    <span className="badge" title={title} style={{ padding: '4px 8px', fontSize: 11, borderColor: statusColor, color: statusColor, background: bg }}>
      Dyn
      <span style={{ color: 'var(--muted)' }}>last eval: {lastText}</span>
      <span style={{ color: 'var(--muted)' }}>next exec: {nextText}</span>
      {windowText ? <span style={{ color: 'var(--muted)' }}>win: {windowText}</span> : null}
    </span>
  );
}
