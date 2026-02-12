'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import {
  loadTargetWeightsStateV1,
  persistTargetWeightsV1,
  type TargetWeightV1,
  type TargetWeightsStateV1,
  parseTargetWeightsJson,
} from '../../../targetWeightsStore';
import { WIZARD_DATA_EVENT, pretty } from '../../../wizardStorage';

type Row = {
  id: string;
  label: string;
  targetPct: string;
};

function toFiniteNumber(x: string): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeTargetPctText(text: string): { value: number | null; normalizedHint?: string } {
  const raw = String(text ?? '').trim();
  if (!raw) return { value: null };

  const n = toFiniteNumber(raw);
  if (n === null) return { value: null };
  if (n < 0) return { value: null };

  // Convenience: accept "60" to mean 60%.
  if (n > 1 && n <= 100) return { value: n / 100, normalizedHint: `${(n / 100).toFixed(4)} (from ${n}%)` };

  return { value: n };
}

function rowsFromState(st: TargetWeightsStateV1): Row[] {
  const rows: Row[] = (st.targetWeights ?? [])
    .filter(Boolean)
    .map((t) => ({
      id: String((t as any)?.id ?? ''),
      label: String((t as any)?.label ?? ''),
      targetPct: String((t as any)?.targetPct ?? ''),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return rows.length ? rows : [{ id: '', label: '', targetPct: '' }];
}

function normalizeRows(rows: Row[]): { items: TargetWeightV1[]; issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];

  const out: TargetWeightV1[] = [];

  for (const r of rows) {
    const id = String(r.id ?? '').trim();
    if (!id) continue;

    const label = String(r.label ?? '').trim() || id;

    const parsed = normalizeTargetPctText(r.targetPct);
    const targetPct = parsed.value;
    if (targetPct === null || !Number.isFinite(targetPct)) {
      issues.push(`targetPct must be a finite number for ${id}`);
      continue;
    }
    if (targetPct < 0 || targetPct > 1) {
      issues.push(`targetPct must be within [0, 1] for ${id} (got ${targetPct})`);
      continue;
    }

    if (parsed.normalizedHint) warnings.push(`${id}: ${parsed.normalizedHint}`);

    out.push({ id, label, targetPct });
  }

  const sum = out.reduce((acc, x) => acc + x.targetPct, 0);
  if (out.length && Math.abs(sum - 1) > 0.05) {
    warnings.push(`sum(targetPct)=${sum.toFixed(4)} (not ~1.0)`);
  }

  return { items: out, issues, warnings };
}

export default function DaaTargetWeightsEditorV0() {
  const [open, setOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const [issues, setIssues] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [rows, setRows] = useState<Row[]>(() => rowsFromState(loadTargetWeightsStateV1()));
  const [pasteText, setPasteText] = useState('');

  const loadFromStorage = useCallback(() => {
    const st = loadTargetWeightsStateV1();
    setRows(rowsFromState(st));
    setIssues([]);
    setWarnings([]);
    setSaveStatus('idle');
  }, []);

  useEffect(() => {
    if (!open) return;
    loadFromStorage();
  }, [open, loadFromStorage]);

  const computed = useMemo(() => normalizeRows(rows), [rows]);

  async function doCopy() {
    try {
      await copyTextToClipboard(pretty(loadTargetWeightsStateV1()));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  function addRow() {
    setRows((x) => [...x, { id: '', label: '', targetPct: '' }]);
  }

  function removeRow(idx: number) {
    setRows((x) => {
      const next = x.filter((_, i) => i !== idx);
      return next.length ? next : [{ id: '', label: '', targetPct: '' }];
    });
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((x) => x.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function doSave() {
    const { items, issues: iss, warnings: warn } = computed;
    setIssues(iss);
    setWarnings(warn);

    if (iss.length) {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    try {
      persistTargetWeightsV1(items);
      setSaveStatus('ok');
      window.setTimeout(() => setSaveStatus('idle'), 1200);
      window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
    } catch {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }

  function doImportJson() {
    const text = String(pasteText ?? '').trim();
    if (!text) return;

    const parsed = parseTargetWeightsJson(text);
    if (!parsed.ok) {
      setIssues([parsed.error]);
      setWarnings([]);
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    setRows(
      parsed.value.map((t) => ({
        id: String(t.id ?? ''),
        label: String(t.label ?? ''),
        targetPct: String(t.targetPct ?? ''),
      }))
    );

    setIssues([]);
    setWarnings(['Imported JSON into editor (click Save to persist).']);
  }

  const headline = useMemo(() => {
    const st = loadTargetWeightsStateV1();
    const n = (st.targetWeights ?? []).length;
    const sum = (st.targetWeights ?? []).reduce((acc, x) => acc + Number((x as any)?.targetPct ?? 0), 0);
    return `rows=${n}; sum=${sum.toFixed(4)}; schemaVersion=${st.schemaVersion}`;
  }, [open, saveStatus]);

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
        <div>
          <div style={{ fontWeight: 800 }}>Target weights editor v0</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{headline}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button type="button" className="button" onClick={doCopy} style={{ padding: '6px 10px' }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy targetWeights JSON'}
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

            <button type="button" className="button" onClick={doSave} style={{ padding: '6px 10px' }}>
              {saveStatus === 'ok' ? 'Saved' : saveStatus === 'error' ? 'Fix issues' : 'Save'}
            </button>

            <button type="button" className="button secondary" onClick={addRow} style={{ padding: '6px 10px' }}>
              + Weight
            </button>

            <span className="muted" style={{ fontSize: 12 }}>
              targetPct supports 0..1 (e.g. 0.6) or 0..100 (e.g. 60).
            </span>
          </div>

          {issues.length ? (
            <div style={{ fontSize: 12 }} className="muted">
              {issues.map((x, i) => (
                <div key={i} style={{ color: 'var(--danger)' }}>{x}</div>
              ))}
            </div>
          ) : null}

          {warnings.length ? (
            <div style={{ fontSize: 12 }} className="muted">
              {warnings.map((x, i) => (
                <div key={i} style={{ color: 'rgba(255,255,255,0.7)' }}>{x}</div>
              ))}
            </div>
          ) : null}

          <div style={{ overflowX: 'auto' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Id</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Label</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>TargetPct</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '6px 0' }}>
                      <input
                        value={r.id}
                        onChange={(e) => updateRow(idx, { id: e.target.value })}
                        placeholder="e.g. SPY / 005963"
                        style={{ width: 160 }}
                      />
                    </td>
                    <td style={{ padding: '6px 0' }}>
                      <input
                        value={r.label}
                        onChange={(e) => updateRow(idx, { label: e.target.value })}
                        placeholder="optional"
                        style={{ width: 220 }}
                      />
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>
                      <input
                        value={r.targetPct}
                        onChange={(e) => updateRow(idx, { targetPct: e.target.value })}
                        inputMode="decimal"
                        placeholder="0.0"
                        style={{ width: 140, textAlign: 'right' as const }}
                      />
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>
                      <button type="button" className="button secondary" onClick={() => removeRow(idx)} style={{ padding: '4px 8px', fontSize: 12 }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Paste JSON</div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder='Paste {"SPY":0.6,"TLT":0.4} or [{"id":"SPY","label":"SPY","targetPct":0.6}, ...]'
              style={{ width: '100%', minHeight: 120, fontFamily: 'ui-monospace, SFMono-Regular', fontSize: 12 }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' as const }}>
              <button type="button" className="button secondary" onClick={doImportJson} style={{ padding: '6px 10px' }}>
                Load JSON → editor
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                This does not persist until you click Save.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
