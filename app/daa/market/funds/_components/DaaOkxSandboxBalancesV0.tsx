'use client';

import { useMemo, useState } from 'react';

import { copyTextToClipboard } from '../../../copyToClipboard';
import { pretty } from '../../../wizardStorage';

type OkxBalanceDetail = {
  ccy: string;
  eq: number | null;
  availEq: number | null;
  cashBal: number | null;
  frozenBal: number | null;
};

type OkxBalancesResponse = {
  ok: true;
  source: 'okx';
  simulatedTrading: string;
  at: string;
  ccy: string | null;
  account?: { uTime: string | null; totalEq: number | null };
  details: OkxBalanceDetail[];
  raw?: unknown;
};

type ErrorResponse = {
  error: string;
  message?: string;
  status?: number;
  code?: string;
  msg?: string;
};

function asString(x: unknown): string {
  return typeof x === 'string' ? x : String(x ?? '');
}

function toNum(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeDetails(x: unknown): OkxBalanceDetail[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((d: any) => ({
      ccy: asString(d?.ccy).trim(),
      eq: toNum(d?.eq),
      availEq: toNum(d?.availEq),
      cashBal: toNum(d?.cashBal),
      frozenBal: toNum(d?.frozenBal),
    }))
    .filter((d) => d.ccy);
}

export default function DaaOkxSandboxBalancesV0() {
  const [open, setOpen] = useState(false);
  const [ccyText, setCcyText] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<OkxBalancesResponse | null>(null);

  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const headline = useMemo(() => {
    if (loading) return 'Fetching...';
    if (error) return `Error: ${error}`;
    if (!payload) return 'Idle';

    const n = Array.isArray(payload.details) ? payload.details.length : 0;
    const totalEq = payload.account?.totalEq;
    const eqText = totalEq === null || totalEq === undefined || !Number.isFinite(totalEq) ? 'n/a' : totalEq.toFixed(4);

    return `ok: details=${n}; totalEq=${eqText}; simulated=${payload.simulatedTrading}`;
  }, [error, loading, payload]);

  async function doCopy() {
    try {
      await copyTextToClipboard(pretty(payload));
      setCopyStatus('ok');
      window.setTimeout(() => setCopyStatus('idle'), 1200);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }

  async function fetchBalances() {
    setLoading(true);
    setError(null);
    setPayload(null);

    try {
      const qs = new URLSearchParams();
      const ccy = ccyText.trim();
      if (ccy) qs.set('ccy', ccy);

      const url = `/api/daa/broker/okx/balances?${qs.toString()}`;

      const r = await fetch(url, { method: 'GET', cache: 'no-store' });
      const text = await r.text();

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: 'response JSON parse failed', raw: text };
      }

      if (!r.ok) {
        const er = parsed && typeof parsed === 'object' ? (parsed as ErrorResponse) : ({ error: String(parsed) } as ErrorResponse);
        const msg = er.message || er.msg || er.error || `HTTP ${r.status}`;
        setError(msg);
        return;
      }

      if (!parsed || typeof parsed !== 'object' || !parsed.ok) {
        setError('unexpected response');
        return;
      }

      const resp: OkxBalancesResponse = {
        ok: true,
        source: 'okx',
        simulatedTrading: asString(parsed.simulatedTrading ?? ''),
        at: asString(parsed.at ?? ''),
        ccy: parsed.ccy === null ? null : asString(parsed.ccy ?? ''),
        account: parsed.account && typeof parsed.account === 'object' ? { uTime: asString(parsed.account.uTime ?? ''), totalEq: toNum(parsed.account.totalEq) } : undefined,
        details: normalizeDetails(parsed.details),
        raw: parsed.raw,
      };

      setPayload(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
        <div>
          <div style={{ fontWeight: 800 }}>OKX sandbox balances v0</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{headline}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button type="button" className="button secondary" onClick={() => setOpen((v) => !v)} style={{ padding: '6px 10px' }} aria-expanded={open}>
            {open ? '收起' : '展开'}
          </button>
        </div>
      </div>

      {open ? (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            This endpoint is <b>localhost-only</b> for safety (it returns account balances). Use SSH port-forwarding or run locally.
            Env required: <code>OKX_API_KEY</code>, <code>OKX_API_SECRET</code>, <code>OKX_API_PASSPHRASE</code>. Optional: <code>OKX_SIMULATED_TRADING=1</code>.
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span className="muted">ccy (optional)</span>
              <input
                value={ccyText}
                onChange={(e) => setCcyText(e.target.value)}
                placeholder="e.g. USDT,BTC"
                style={{ width: 220 }}
              />
            </label>

            <button type="button" className="button" onClick={fetchBalances} disabled={loading} style={{ padding: '6px 10px' }}>
              {loading ? 'Fetching...' : 'Fetch balances'}
            </button>

            <button type="button" className="button secondary" onClick={doCopy} disabled={!payload} style={{ padding: '6px 10px' }}>
              {copyStatus === 'ok' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy JSON'}
            </button>
          </div>

          {error ? (
            <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>
          ) : null}

          {payload ? (
            <div style={{ overflowX: 'auto' as const }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>CCY</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>eq</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>availEq</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>cashBal</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 6 }}>frozenBal</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.details.map((d) => (
                    <tr key={d.ccy}>
                      <td style={{ padding: '6px 0' }}>{d.ccy}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{d.eq === null ? 'n/a' : d.eq.toFixed(8)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{d.availEq === null ? 'n/a' : d.availEq.toFixed(8)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{d.cashBal === null ? 'n/a' : d.cashBal.toFixed(8)}</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{d.frozenBal === null ? 'n/a' : d.frozenBal.toFixed(8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
