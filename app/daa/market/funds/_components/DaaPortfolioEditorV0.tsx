'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { loadPortfolioStateV1, savePortfolioStateV1, type PortfolioStateV1 } from '../../../portfolioStateStore';
import { WIZARD_DATA_EVENT, pretty } from '../../../wizardStorage';

type Row = {
  symbol: string;
  qty: string;
  cost: string;
};

function toFiniteNumber(x: string): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function rowsFromState(st: PortfolioStateV1): Row[] {
  const rows: Row[] = Object.entries(st.positions ?? {})
    .map(([symbol, p]) => ({
      symbol: String(symbol ?? ''),
      qty: String((p as any)?.qty ?? ''),
      cost: (p as any)?.cost === undefined ? '' : String((p as any)?.cost ?? ''),
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  return rows.length ? rows : [{ symbol: '', qty: '', cost: '' }];
}

function normalizeState(args: {
  base: PortfolioStateV1;
  cashText: string;
  rows: Row[];
}): { state: PortfolioStateV1; issues: string[] } {
  const issues: string[] = [];

  const cashNum = toFiniteNumber(args.cashText);
  const cash = cashNum === null ? NaN : cashNum;
  if (!Number.isFinite(cash) || cash < 0) issues.push('cash must be a finite number >= 0');

  const positions: PortfolioStateV1['positions'] = {};

  for (const r of args.rows) {
    const symbol = String(r.symbol ?? '').trim();
    if (!symbol) continue;

    const qtyNum = toFiniteNumber(String(r.qty ?? '').trim());
    const qty = qtyNum === null ? NaN : qtyNum;
    if (!Number.isFinite(qty) || qty <= 0) {
      issues.push(`qty must be > 0 for ${symbol}`);
      continue;
    }

    const costText = String(r.cost ?? '').trim();
    const costNum = costText ? toFiniteNumber(costText) : null;
    if (costText && (costNum === null || !Number.isFinite(costNum) || costNum < 0)) {
      issues.push(`cost must be a finite number >= 0 for ${symbol}`);
      continue;
    }

    positions[symbol] = costText ? { qty, cost: costNum as number } : { qty };
  }

  const next: PortfolioStateV1 = {
    ...args.base,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    cash: Number.isFinite(cash) && cash >= 0 ? cash : 0,
    positions,
  };

  return { state: next, issues };
}

export default function DaaPortfolioEditorV0() {
  const [open, setOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [issues, setIssues] = useState<string[]>([]);

  const [baseState, setBaseState] = useState<PortfolioStateV1>(() => loadPortfolioStateV1());
  const [cashText, setCashText] = useState(() => String(loadPortfolioStateV1().cash ?? 0));
  const [rows, setRows] = useState<Row[]>(() => rowsFromState(loadPortfolioStateV1()));

  const loadFromStorage = useCallback(() => {
    const st = loadPortfolioStateV1();
    setBaseState(st);
    setCashText(String(st.cash ?? 0));
    setRows(rowsFromState(st));
    setIssues([]);
    setSaveStatus('idle');
  }, []);

  useEffect(() => {
    if (!open) return;
    // When opening, refresh from storage so user edits the latest state.
    loadFromStorage();
  }, [open, loadFromStorage]);

  const computed = useMemo(() => normalizeState({ base: baseState, cashText, rows }), [baseState, cashText, rows]);

  async function doCopy() {
    try {
      await copyTextToClipboard(pretty(loadPortfolioStateV1()));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  function addRow() {
    setRows((x) => [...x, { symbol: '', qty: '', cost: '' }]);
  }

  function removeRow(idx: number) {
    setRows((x) => {
      const next = x.filter((_, i) => i !== idx);
      return next.length ? next : [{ symbol: '', qty: '', cost: '' }];
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
      savePortfolioStateV1(state);
      // Trigger refresh in the same tab.
      window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
      setBaseState(state);
      setSaveStatus('ok');
      window.setTimeout(() => setSaveStatus('idle'), 1200);
    } catch {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }

  const headline = useMemo(() => {
    const st = loadPortfolioStateV1();
    const n = Object.keys(st.positions ?? {}).length;
    return `cash=${st.cash.toFixed(2)}; positions=${n}; schemaVersion=${st.schemaVersion}`;
  }, [open, saveStatus]);

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
        <div>
          <div style={{ fontWeight: 800 }}>Portfolio editor v0</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{headline}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button type="button" className="button" onClick={doCopy} style={{ padding: '6px 10px' }}>
            {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy portfolio JSON'}
          </button>
          <button type="button" className="button secondary" onClick={() => setOpen((v) => !v)} style={{ padding: '6px 10px' }} aria-expanded={open}>
            {open ? '收起' : '编辑'}
          </button>
        </div>
      </div>

      {open ? (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span className="muted">Cash</span>
              <input
                value={cashText}
                onChange={(e) => setCashText(e.target.value)}
                inputMode="decimal"
                style={{ width: 160 }}
              />
            </label>

            <button type="button" className="button secondary" onClick={loadFromStorage} style={{ padding: '6px 10px' }}>
              Reload
            </button>

            <button type="button" className="button" onClick={doSave} style={{ padding: '6px 10px' }}>
              {saveStatus === 'ok' ? 'Saved' : saveStatus === 'error' ? 'Fix issues' : 'Save'}
            </button>

            <button type="button" className="button secondary" onClick={addRow} style={{ padding: '6px 10px' }}>
              + Position
            </button>
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
                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Qty</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>Cost (optional)</th>
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
                        value={r.qty}
                        onChange={(e) => updateRow(idx, { qty: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        style={{ width: 120, textAlign: 'right' as const }}
                      />
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>
                      <input
                        value={r.cost}
                        onChange={(e) => updateRow(idx, { cost: e.target.value })}
                        inputMode="decimal"
                        placeholder=""
                        style={{ width: 140, textAlign: 'right' as const }}
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
            Stored at localStorage key <code>daa.portfolio.state</code> (schemaVersion=1). Empty/invalid rows are ignored.
          </div>
        </div>
      ) : null}
    </div>
  );
}
