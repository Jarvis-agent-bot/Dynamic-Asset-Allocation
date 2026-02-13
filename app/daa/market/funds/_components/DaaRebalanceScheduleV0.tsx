'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { pretty } from '../../../wizardStorage';

import { computeNextRunAtLocalV0, defaultRebalanceScheduleV1, type RebalanceScheduleCadenceV0, type RebalanceScheduleV1 } from '@/src/daa/rebalanceScheduleV0';
import { loadRebalanceScheduleStateV1, persistRebalanceScheduleV1 } from '../../../rebalanceScheduleStore';

const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

function normalizeTimeInput(raw: string): string {
  const s = String(raw ?? '').trim();
  // `input[type=time]` is already HH:MM, but keep a tiny guard.
  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(s)) return s;
  return '';
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

export default function DaaRebalanceScheduleV0() {
  const [open, setOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const [enabled, setEnabled] = useState(false);
  const [cadence, setCadence] = useState<RebalanceScheduleCadenceV0>('weekly');
  const [timeLocalHHMM, setTimeLocalHHMM] = useState('');
  const [weekday0Sun, setWeekday0Sun] = useState(1);

  const [issues, setIssues] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const loadFromStorage = useCallback(() => {
    const st = loadRebalanceScheduleStateV1();
    setEnabled(!!st.schedule.enabled);
    setCadence(st.schedule.cadence);
    setTimeLocalHHMM(st.schedule.timeLocalHHMM);
    setWeekday0Sun(typeof st.schedule.weekday0Sun === 'number' ? st.schedule.weekday0Sun : 1);

    setIssues([]);
    setWarnings([]);
    setSaveStatus('idle');
  }, []);

  useEffect(() => {
    if (!open) return;
    loadFromStorage();
  }, [open, loadFromStorage]);

  const computed = useMemo(() => {
    const iss: string[] = [];
    const warn: string[] = [];

    const t = normalizeTimeInput(timeLocalHHMM);
    if (!t) iss.push('timeLocalHHMM must be HH:MM (24h)');

    const schedule: RebalanceScheduleV1 | null = t
      ? {
          enabled,
          cadence,
          timeLocalHHMM: t,
          weekday0Sun: cadence === 'weekly' ? weekday0Sun : undefined,
        }
      : null;

    const next = schedule ? computeNextRunAtLocalV0(schedule, new Date()) : null;

    if (enabled && !next) warn.push('Enabled but next run cannot be computed (check time/weekday).');

    return { issues: iss, warnings: warn, schedule, nextRunAt: next };
  }, [cadence, enabled, timeLocalHHMM, weekday0Sun]);

  const headline = useMemo(() => {
    const st = loadRebalanceScheduleStateV1();
    const s = st.schedule;

    if (!s.enabled) {
      return `disabled; cadence=${s.cadence}; time=${s.timeLocalHHMM}; schemaVersion=${st.schemaVersion}`;
    }

    const next = computeNextRunAtLocalV0(s, new Date());
    const weekly = s.cadence === 'weekly' ? `; weekday=${WEEKDAYS.find((x) => x.value === (s.weekday0Sun ?? 1))?.label ?? String(s.weekday0Sun)}` : '';
    const nextText = next ? `; next=${formatLocalCompact(next)}` : '; next=<unknown>';

    return `enabled; cadence=${s.cadence}${weekly}; time=${s.timeLocalHHMM}${nextText}; schemaVersion=${st.schemaVersion}`;
  }, [open, saveStatus]);

  async function doCopy() {
    try {
      await copyTextToClipboard(pretty(loadRebalanceScheduleStateV1()));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  function doResetDefaults() {
    const d = defaultRebalanceScheduleV1();
    setEnabled(d.enabled);
    setCadence(d.cadence);
    setTimeLocalHHMM(d.timeLocalHHMM);
    setWeekday0Sun(d.weekday0Sun ?? 1);
    setWarnings(['Reset editor fields to defaults (click Save to persist).']);
    setIssues([]);
  }

  function doSave() {
    setIssues(computed.issues);
    setWarnings(computed.warnings);

    if (computed.issues.length || !computed.schedule) {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    try {
      persistRebalanceScheduleV1(computed.schedule);
      setSaveStatus('ok');
      window.setTimeout(() => setSaveStatus('idle'), 1200);
    } catch {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
        <div>
          <div style={{ fontWeight: 800 }}>Dynamic rebalance schedule UI v0</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {headline}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button type="button" className="button" onClick={doCopy} style={{ padding: '6px 10px' }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy schedule JSON'}
          </button>
          <button type="button" className="button secondary" onClick={() => setOpen((v) => !v)} style={{ padding: '6px 10px' }} aria-expanded={open}>
            {open ? '收起' : '编辑'}
          </button>
        </div>
      </div>

      {open ? (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <button type="button" className="button secondary" onClick={loadFromStorage} style={{ padding: '6px 10px' }}>
              Reload
            </button>
            <button type="button" className="button secondary" onClick={doResetDefaults} style={{ padding: '6px 10px' }}>
              Reset defaults
            </button>
            <button type="button" className="button" onClick={doSave} style={{ padding: '6px 10px' }}>
              {saveStatus === 'ok' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Save'}
            </button>
          </div>

          <div className="muted" style={{ fontSize: 12 }}>
            This only stores a local schedule plan. Triggering automated runs is out-of-scope for v0.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>enabled</div>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 18, height: 18 }} />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>cadence</div>
              <select value={cadence} onChange={(e) => setCadence(e.target.value as RebalanceScheduleCadenceV0)} style={{ padding: '6px 10px', borderRadius: 10 }}>
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>time (local)</div>
              <input type="time" className="input" value={timeLocalHHMM} onChange={(e) => setTimeLocalHHMM(e.target.value)} />
            </label>
          </div>

          {cadence === 'weekly' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, maxWidth: 280 }}>
                <div className="muted" style={{ fontSize: 12 }}>weekday</div>
                <select value={weekday0Sun} onChange={(e) => setWeekday0Sun(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 10 }}>
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="muted" style={{ fontSize: 12 }}>
            Next run: {computed.nextRunAt ? `${formatLocalCompact(computed.nextRunAt)} (local)` : '<disabled/invalid>'}
          </div>

          {issues.length ? (
            <div style={{ fontSize: 12, color: 'var(--danger)' }}>{issues.join('; ')}</div>
          ) : warnings.length ? (
            <div className="muted" style={{ fontSize: 12 }}>{warnings.join(' · ')}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
