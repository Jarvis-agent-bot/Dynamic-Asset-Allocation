'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import {
  defaultRebalancePolicyV1,
  loadRebalancePolicyStateV1,
  persistRebalancePolicyV1,
  type RebalancePolicyV1,
} from '../../../rebalancePolicyStore';
import { WIZARD_DATA_EVENT, pretty } from '../../../wizardStorage';

function toFiniteNumber(x: string): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeThresholdPctText(text: string): { value: number | null; normalizedHint?: string } {
  const raw = String(text ?? '').trim();
  if (!raw) return { value: null };

  const n = toFiniteNumber(raw);
  if (n === null) return { value: null };
  if (n <= 0) return { value: 0 };

  // Convenience: accept "1" to mean 1%.
  if (n >= 1 && n <= 100) return { value: n / 100, normalizedHint: `${(n / 100).toFixed(4)} (from ${n}%)` };

  return { value: n, normalizedHint: n > 1 ? `${n.toFixed(4)} (clamped to 1.0 at runtime)` : undefined };
}

function normalizeNonNegativeText(text: string): number | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const n = toFiniteNumber(raw);
  if (n === null) return null;
  return Math.max(0, n);
}

export default function DaaRebalancePolicyEditorV0() {
  const [open, setOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const [issues, setIssues] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [thresholdPct, setThresholdPct] = useState('');
  const [minTradeNotional, setMinTradeNotional] = useState('');
  const [cooldownMinutes, setCooldownMinutes] = useState('');

  const loadFromStorage = useCallback(() => {
    const st = loadRebalancePolicyStateV1();
    setThresholdPct(String(st.policy.thresholdPct));
    setMinTradeNotional(String(st.policy.minTradeNotional));
    setCooldownMinutes(String((st.policy.cooldownSeconds ?? 0) / 60));

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

    const t = normalizeThresholdPctText(thresholdPct);
    const threshold = t.value;
    if (threshold === null || !Number.isFinite(threshold)) iss.push('thresholdPct must be a finite number');
    if (t.normalizedHint) warn.push(`thresholdPct: ${t.normalizedHint}`);

    const minNotional = normalizeNonNegativeText(minTradeNotional);
    if (minNotional === null || !Number.isFinite(minNotional)) iss.push('minTradeNotional must be a finite number');

    const cdMin = normalizeNonNegativeText(cooldownMinutes);
    if (cdMin === null || !Number.isFinite(cdMin)) iss.push('cooldownMinutes must be a finite number');

    const policy: RebalancePolicyV1 | null =
      threshold !== null && minNotional !== null && cdMin !== null
        ? {
            thresholdPct: Math.min(1, Math.max(0, threshold)),
            minTradeNotional: Math.max(0, minNotional),
            cooldownSeconds: Math.max(0, cdMin * 60),
          }
        : null;

    return { issues: iss, warnings: warn, policy };
  }, [cooldownMinutes, minTradeNotional, thresholdPct]);

  async function doCopy() {
    try {
      await copyTextToClipboard(pretty(loadRebalancePolicyStateV1()));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  function doResetDefaults() {
    const d = defaultRebalancePolicyV1();
    setThresholdPct(String(d.thresholdPct));
    setMinTradeNotional(String(d.minTradeNotional));
    setCooldownMinutes(String(d.cooldownSeconds / 60));
    setWarnings(['Reset editor fields to defaults (click Save to persist).']);
    setIssues([]);
  }

  function doSave() {
    setIssues(computed.issues);
    setWarnings(computed.warnings);

    if (computed.issues.length || !computed.policy) {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    try {
      persistRebalancePolicyV1(computed.policy);
      setSaveStatus('ok');
      window.setTimeout(() => setSaveStatus('idle'), 1200);
      window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
    } catch {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }

  const headline = useMemo(() => {
    const st = loadRebalancePolicyStateV1();
    return `threshold=${(st.policy.thresholdPct * 100).toFixed(2)}%; minTradeNotional=${st.policy.minTradeNotional}; cooldown=${(st.policy.cooldownSeconds / 60).toFixed(1)}m; schemaVersion=${st.schemaVersion}`;
  }, [open, saveStatus]);

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
        <div>
          <div style={{ fontWeight: 800 }}>Trigger policy editor v0</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{headline}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button type="button" className="button" onClick={doCopy} style={{ padding: '6px 10px' }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy policy JSON'}
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
            thresholdPct: accept "1" to mean 1%; minTradeNotional is in account base currency; cooldown is minutes.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>thresholdPct</div>
              <input className="input" value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} placeholder="e.g. 1 (means 1%)" />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>minTradeNotional</div>
              <input className="input" value={minTradeNotional} onChange={(e) => setMinTradeNotional(e.target.value)} placeholder="e.g. 10" />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 12 }}>cooldownMinutes</div>
              <input className="input" value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} placeholder="e.g. 10" />
            </label>
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
