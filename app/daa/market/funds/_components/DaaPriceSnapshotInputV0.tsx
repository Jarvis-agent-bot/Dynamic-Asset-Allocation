'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { pretty, WIZARD_DATA_EVENT } from '../../../wizardStorage';

import {
  defaultPriceSnapshotV1,
  loadPriceSnapshotV1,
  parsePriceSnapshotText,
  savePriceSnapshotV1,
  type PriceSnapshotV1,
} from '../../../priceSnapshotStore';

type Row = { symbol: string; price: string };

function toFinitePositiveNumber(x: string): number | null {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function rowsFromState(st: PriceSnapshotV1): Row[] {
  const rows: Row[] = Object.entries(st.prices ?? {})
    .map(([symbol, v]) => ({ symbol: String(symbol ?? ''), price: String((v as any)?.price ?? '') }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  return rows.length ? rows : [{ symbol: '', price: '' }];
}

function normalizeState(args: { base: PriceSnapshotV1; rows: Row[] }): { state: PriceSnapshotV1; issues: string[] } {
  const issues: string[] = [];
  const prices: PriceSnapshotV1['prices'] = {};

  for (const r of args.rows) {
    const symbol = String(r.symbol ?? '').trim();
    if (!symbol) continue;

    const priceNum = toFinitePositiveNumber(String(r.price ?? '').trim());
    if (priceNum === null) {
      issues.push(`price must be > 0 for ${symbol}`);
      continue;
    }

    prices[symbol] = { price: priceNum };
  }

  return {
    state: {
      ...args.base,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      prices,
    },
    issues,
  };
}

export default function DaaPriceSnapshotInputV0() {
  const [open, setOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [issues, setIssues] = useState<string[]>([]);

  const [baseState, setBaseState] = useState<PriceSnapshotV1>(() => loadPriceSnapshotV1());
  const [rows, setRows] = useState<Row[]>(() => rowsFromState(loadPriceSnapshotV1()));
  const [pasteText, setPasteText] = useState('');

  const loadFromStorage = useCallback(() => {
    const st = loadPriceSnapshotV1();
    setBaseState(st);
    setRows(rowsFromState(st));
    setIssues([]);
    setSaveStatus('idle');
  }, []);

  useEffect(() => {
    if (!open) return;
    loadFromStorage();
  }, [open, loadFromStorage]);

  const computed = useMemo(() => normalizeState({ base: baseState, rows }), [baseState, rows]);

  async function doCopy() {
    try {
      await copyTextToClipboard(pretty(loadPriceSnapshotV1()));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  function addRow() {
    setRows((x) => [...x, { symbol: '', price: '' }]);
  }

  function removeRow(idx: number) {
    setRows((x) => {
      const next = x.filter((_, i) => i !== idx);
      return next.length ? next : [{ symbol: '', price: '' }];
    });
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((x) => x.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function doSave() {
    const { state, issues: iss } = computed;
    setIssues(iss);

    if (iss.length) {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    try {
      savePriceSnapshotV1(state);
      window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
      setBaseState(state);
      setSaveStatus('ok');
      window.setTimeout(() => setSaveStatus('idle'), 1200);
    } catch {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }

  function doClear() {
    const next = defaultPriceSnapshotV1();
    savePriceSnapshotV1(next);
    setBaseState(next);
    setRows([{ symbol: '', price: '' }]);
    setIssues([]);
    setSaveStatus('ok');
    window.setTimeout(() => setSaveStatus('idle'), 1200);
  }

  function doPasteMerge() {
    const parsed = parsePriceSnapshotText(pasteText);

    const merged: Row[] = (() => {
      const bySym = new Map<string, Row>();
      for (const r of rows) {
        const sym = String(r.symbol ?? '').trim();
        if (!sym) continue;
        bySym.set(sym, { symbol: sym, price: String(r.price ?? '').trim() });
      }
      for (const [sym, price] of Object.entries(parsed.prices)) {
        bySym.set(sym, { symbol: sym, price: String(price) });
      }
      const out = Array.from(bySym.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
      return out.length ? out : [{ symbol: '', price: '' }];
    })();

    const mergedComputed = normalizeState({ base: baseState, rows: merged });
    setRows(merged);
    setIssues([...(parsed.issues ?? []), ...(mergedComputed.issues ?? [])]);

    if (!mergedComputed.issues.length) {
      savePriceSnapshotV1(mergedComputed.state);
      setBaseState(mergedComputed.state);
      setPasteText('');
      setSaveStatus('ok');
      window.setTimeout(() => setSaveStatus('idle'), 1200);
    } else {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }

  const headline = useMemo(() => {
    const st = loadPriceSnapshotV1();
    const n = Object.keys(st.prices ?? {}).length;
    return `symbols=${n}; schemaVersion=${st.schemaVersion}`;
  }, [open, saveStatus]);

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
        <div>
          <div style={{ fontWeight: 800 }}>Price snapshot v0</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{headline}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button type="button" className="button" onClick={doCopy} style={{ padding: '6px 10px' }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy prices JSON'}
          </button>
          <button type="button" className="button secondary" onClick={() => setOpen((v) => !v)} style={{ padding: '6px 10px' }} aria-expanded={open}>
            {open ? '收起' : '编辑'}
          </button>
        </div>
      </div>

      {open ? (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Paste formats: JSON (object/array), or lines like <code>SYMBOL 123.45</code> / <code>SYMBOL=123.45</code>. Stored in localStorage.
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <button type="button" className="button" onClick={doSave} style={{ padding: '6px 10px' }}>
              {saveStatus === 'ok' ? 'Saved' : saveStatus === 'error' ? 'Fix issues' : 'Save'}
            </button>
            <button type="button" className="button secondary" onClick={loadFromStorage} style={{ padding: '6px 10px' }}>
              Reload
            </button>
            <button type="button" className="button secondary" onClick={addRow} style={{ padding: '6px 10px' }}>
              + Symbol
            </button>
            <button type="button" className="button secondary" onClick={doClear} style={{ padding: '6px 10px' }}>
              Clear
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'Paste price snapshot here...\n\nExample:\n005963 1.234\n000001=1.052'}
              style={{ minHeight: 90, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <button type="button" className="button" onClick={doPasteMerge} style={{ padding: '6px 10px' }} disabled={!pasteText.trim()}>
                Paste + merge + save
              </button>
            </div>
          </div>

          {issues.length ? (
            <div style={{ fontSize: 12 }} className="muted">
              {issues.map((x, i) => (
                <div key={i} style={{ color: 'var(--danger)' }}>{x}</div>
              ))}
            </div>
          ) : null}

          <div style={{ overflowX: 'auto' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Symbol</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Price</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '6px 0' }}>
                      <input
                        value={r.symbol}
                        onChange={(e) => updateRow(idx, { symbol: e.target.value })}
                        placeholder="e.g. 005963"
                        style={{ width: 180 }}
                      />
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>
                      <input
                        value={r.price}
                        onChange={(e) => updateRow(idx, { price: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        style={{ width: 160, textAlign: 'right' as const }}
                      />
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>
                      <button type="button" className="button secondary" onClick={() => removeRow(idx)} style={{ padding: '4px 8px' }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="muted" style={{ fontSize: 11 }}>
            localStorage key <code>daa.priceSnapshot.v1</code>. Prices are treated as manual overrides for weight calculations.
          </div>
        </div>
      ) : null}
    </div>
  );
}
