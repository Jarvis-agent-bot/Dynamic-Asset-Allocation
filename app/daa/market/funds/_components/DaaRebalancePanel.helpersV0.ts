import { getSnapshotPrice } from '../../../priceSnapshotStore';
import { type RebalancePostRunSummaryV0 } from '@/src/daa/rebalancePostRunSummary';
import { scrollToIdAndFocusV0 } from '@/src/daa/focusV0';
import { coerceSeriesBySymbolInput, snapshotsToSeriesBySymbol } from '@/src/core/priceSnapshotsToSeries';

export type QuotePriceSourceV0 = 'estGsz' | 'gsz' | 'dwjz' | 'missing';
export type EffectivePriceSourceV0 = 'manual' | QuotePriceSourceV0;

export type TargetWeight = { id: string; label: string; targetPct: number };
export type SuggestedOrder = {
  symbol: string;
  side: string;
  notional: number;
  reason?: string;
};

export type DriftAlertBreach = {
  id: string;
  label: string;
  // Signed drift vs target (currentPct - targetPct).
  driftPct: number;
};

export type DriftAlertV0 = {
  at: string;
  source: 'ui-pre' | 'core';
  thresholdPct: number;
  maxAbsDriftPct: number;
  maxAbsDriftSymbol: string | null;
  breached: boolean;
  breaches: DriftAlertBreach[];
  // Optional: surface trigger policy verdict when we have it.
  shouldRebalance?: boolean;
  eligibleOrderCount?: number;
  reasons?: string[];
};

export type PaperRunHealthcheckV0 = {
  expected: RebalancePostRunSummaryV0 | null;
  actual: RebalancePostRunSummaryV0 | null;
  pass: boolean | null;
  notes: string[];
};

export type FundQuoteLikeV0 = {
  dwjz?: string | number;
  gsz?: string | number;
  estPricedCoverage?: number;
  estGsz?: number;
};

export function scrollToId(id: string) {
  scrollToIdAndFocusV0(id);
}

export function downloadTextAsFile(args: { filename: string; text: string; mime: string }) {
  try {
    const blob = new Blob([args.text], { type: args.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = args.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the click a tick before cleanup.
    window.setTimeout(() => URL.revokeObjectURL(url), 250);
  } catch {
    // ignore
  }
}

export function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

export function pickFundQuotePriceV0(fund: FundQuoteLikeV0 | undefined): { price: number | null; source: QuotePriceSourceV0 } {
  if (!fund) return { price: null, source: 'missing' };
  const coverage = toFiniteNumber(fund.estPricedCoverage) ?? 0;
  if (coverage > 0.05) {
    const est = toFiniteNumber(fund.estGsz);
    if (est && est > 0) return { price: est, source: 'estGsz' };
  }
  const gsz = toFiniteNumber(fund.gsz);
  if (gsz && gsz > 0) return { price: gsz, source: 'gsz' };
  // dwjz = last close (yesterday's NAV) for funds.
  const dwjz = toFiniteNumber(fund.dwjz);
  if (dwjz && dwjz > 0) return { price: dwjz, source: 'dwjz' };
  return { price: null, source: 'missing' };
}

export function resolveFundPriceV0(args: {
  symbol: string;
  snapshot: unknown;
  fund: FundQuoteLikeV0 | undefined;
}): { price: number | null; source: EffectivePriceSourceV0 } {
  const manual = getSnapshotPrice(args.snapshot as any, args.symbol);
  if (manual && manual > 0) return { price: manual, source: 'manual' };
  const quote = pickFundQuotePriceV0(args.fund);
  return { price: quote.price, source: quote.source };
}

export function pickFundNav(fund: FundQuoteLikeV0 | undefined): number | null {
  return pickFundQuotePriceV0(fund).price;
}

export function normalizeOrders(x: unknown): SuggestedOrder[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((o: any) => ({
      symbol: String(o?.symbol ?? ''),
      side: String(o?.side ?? ''),
      notional: Number(o?.notional ?? 0),
      reason: o?.reason === undefined ? undefined : String(o?.reason),
    }))
    .filter((o) => o.symbol && o.side && Number.isFinite(o.notional) && o.notional !== 0);
}

export function normalizeTargetWeights(args: { response: unknown; moneyPlan: unknown }): TargetWeight[] {
  // Prefer weights returned by the engine if present; otherwise fall back to money_plan.allocations.
  if (args.response && typeof args.response === 'object') {
    const r: any = args.response as any;
    const raw = r.targetWeights ?? r.target_weights;
    if (Array.isArray(raw)) {
      return raw
        .filter(Boolean)
        .map((a: any) => ({
          id: String(a?.id ?? a?.symbol ?? ''),
          label: String(a?.label ?? a?.name ?? a?.id ?? a?.symbol ?? ''),
          targetPct: Number(a?.targetPct ?? a?.target_pct ?? a?.weight ?? 0),
        }))
        .filter((a) => a.id && a.label && Number.isFinite(a.targetPct));
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return Object.entries(raw as Record<string, unknown>)
        .map(([id, targetPct]) => ({ id, label: id, targetPct: Number(targetPct ?? 0) }))
        .filter((a) => a.id && Number.isFinite(a.targetPct));
    }
  }
  const mp: any = args.moneyPlan as any;
  const allocs = mp?.allocations;
  if (!Array.isArray(allocs)) return [];
  return allocs
    .filter(Boolean)
    .map((a: any) => ({
      id: String(a?.id ?? ''),
      label: String(a?.label ?? a?.id ?? ''),
      targetPct: Number(a?.targetPct ?? 0),
    }))
    .filter((a) => a.id && a.label && Number.isFinite(a.targetPct));
}

export function normalizeTargetWeightsAny(raw: unknown): TargetWeight[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter(Boolean)
      .map((a: any) => ({
        id: String(a?.id ?? a?.symbol ?? ''),
        label: String(a?.label ?? a?.name ?? a?.id ?? a?.symbol ?? ''),
        targetPct: Number(a?.targetPct ?? a?.target_pct ?? a?.weight ?? 0),
      }))
      .filter((a) => a.id && a.label && Number.isFinite(a.targetPct));
  }
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([id, targetPct]) => ({ id, label: id, targetPct: Number(targetPct ?? 0) }))
      .filter((a) => a.id && Number.isFinite(a.targetPct));
  }
  return [];
}

export function formatOrdersMarkdown(orders: SuggestedOrder[]) {
  const rows = orders.map((o) => `| ${o.symbol} | ${o.side} | ${o.notional.toFixed(2)} | ${o.reason ? o.reason.replace(/\|/g, ' ') : ''} |`);
  return ['| Symbol | Side | Notional | Why |', '| --- | --- | ---: | --- |', ...rows].join('\n');
}

export function formatWeightsMarkdown(rows: Array<{ id: string; label: string; currentPct: number; targetPct: number; deltaPct: number }>) {
  const lines = rows.map((r) => `| ${r.label} (${r.id}) | ${(r.currentPct * 100).toFixed(1)}% | ${(r.targetPct * 100).toFixed(1)}% | ${(r.deltaPct * 100).toFixed(1)}% |`);
  return ['| Asset | Current | Target | Delta |', '| --- | ---: | ---: | ---: |', ...lines].join('\n');
}

export function fmtPct01(x: number) {
  if (!Number.isFinite(x)) return 'n/a';
  return `${(x * 100).toFixed(2)}%`;
}

export function computeDriftAlertFromTableRows(args: {
  at: string;
  rows: Array<{ id: string; label: string; deltaPct: number }>;
  thresholdPct: number;
}): DriftAlertV0 {
  let maxAbs = 0;
  let maxSym: string | null = null;
  for (const r of args.rows) {
    const abs = Math.abs(r.deltaPct);
    if (!Number.isFinite(abs)) continue;
    if (abs > maxAbs) {
      maxAbs = abs;
      maxSym = r.id;
    }
  }
  const thresholdPct = Number.isFinite(args.thresholdPct) && args.thresholdPct > 0 ? args.thresholdPct : 0;
  const breaches = args.rows
    .filter((r) => Number.isFinite(r.deltaPct) && thresholdPct > 0 && Math.abs(r.deltaPct) >= thresholdPct)
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    .slice(0, 6)
    .map((r) => ({ id: r.id, label: r.label, driftPct: r.deltaPct }));
  return {
    at: args.at,
    source: 'ui-pre',
    thresholdPct,
    maxAbsDriftPct: maxAbs,
    maxAbsDriftSymbol: maxSym,
    breached: thresholdPct > 0 && maxAbs >= thresholdPct,
    breaches,
  };
}

export function computeDriftAlertFromCoreResponse(args: { at: string; resp: any; fallbackThresholdPct: number }): DriftAlertV0 {
  const stats: any = args.resp?.trigger?.stats ?? {};
  const explain: any = args.resp?.explain ?? {};
  const equity = toFiniteNumber(explain?.equity) ?? toFiniteNumber(stats?.equity) ?? 0;
  const thresholdPct =
    (toFiniteNumber(stats?.thresholdPct) ?? null) !== null && (toFiniteNumber(stats?.thresholdPct) as number) > 0
      ? (toFiniteNumber(stats?.thresholdPct) as number)
      : args.fallbackThresholdPct;
  const labels = new Map<string, string>();
  if (Array.isArray(args.resp?.targetWeights)) {
    for (const w of args.resp.targetWeights) {
      const id = String((w as any)?.id ?? '').trim();
      if (!id) continue;
      const label = String((w as any)?.label ?? id).trim() || id;
      labels.set(id, label);
    }
  }
  const breaches: DriftAlertBreach[] = [];
  let maxAbs = 0;
  let maxSym: string | null = null;
  const deltas = explain?.deltas;
  if (equity > 0 && deltas && typeof deltas === 'object' && !Array.isArray(deltas)) {
    for (const [idRaw, deltaRaw] of Object.entries(deltas as Record<string, unknown>)) {
      const id = String(idRaw ?? '').trim();
      if (!id) continue;
      const delta = toFiniteNumber(deltaRaw);
      if (delta === null) continue;
      // delta = desired - current (notional). driftPct = currentPct - targetPct = -delta / equity.
      const driftPct = -delta / equity;
      if (!Number.isFinite(driftPct)) continue;
      const abs = Math.abs(driftPct);
      if (abs > maxAbs) {
        maxAbs = abs;
        maxSym = id;
      }
      if (thresholdPct > 0 && abs >= thresholdPct) {
        breaches.push({ id, label: labels.get(id) ?? id, driftPct });
      }
    }
  }
  breaches.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));
  const topBreaches = breaches.slice(0, 6);
  const maxAbsFromStats = toFiniteNumber(stats?.maxAbsDriftPct);
  const maxSymFromStats = typeof stats?.maxAbsDriftSymbol === 'string' && stats.maxAbsDriftSymbol ? String(stats.maxAbsDriftSymbol) : null;
  const maxAbsFinal = maxAbsFromStats !== null ? maxAbsFromStats : maxAbs;
  const maxSymFinal = maxSymFromStats ?? maxSym;
  const reasonsRaw = args.resp?.trigger?.reasons;
  const reasons = Array.isArray(reasonsRaw) ? reasonsRaw.map((x: any) => String(x)) : undefined;
  return {
    at: args.at,
    source: 'core',
    thresholdPct,
    maxAbsDriftPct: maxAbsFinal,
    maxAbsDriftSymbol: maxSymFinal,
    breached: thresholdPct > 0 && maxAbsFinal >= thresholdPct,
    breaches: topBreaches,
    shouldRebalance: !!args.resp?.trigger?.shouldRebalance,
    eligibleOrderCount: toFiniteNumber(stats?.eligibleOrderCount) ?? undefined,
    reasons,
  };
}


export function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: 'JSON parse failed' };
  }
}

export function normalizePlanSymbol(sym: unknown): string {
  return String(sym ?? '').trim().toUpperCase();
}

export function tryBuildSeriesBySymbolForPlan(
  input: unknown,
): { ok: true; seriesBySymbol: Record<string, any[]>; symbols: string[] } | { ok: false; error: string } {
  const coerced = coerceSeriesBySymbolInput(input) as any;
  const symbolsFromSeries = Object.keys(coerced || {}).filter(Boolean).sort();
  if (symbolsFromSeries.length) return { ok: true, seriesBySymbol: coerced, symbols: symbolsFromSeries };
  try {
    const snapshots = (() => {
      if (Array.isArray(input)) return input;
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        const obj: any = input as any;
        if (Array.isArray(obj.snapshots)) return obj.snapshots;
        const entries = Object.entries(obj as Record<string, unknown>);
        const looksLikeDateMap = entries.some(([k]) => /^\d{4}-\d{2}-\d{2}/.test(String(k)));
        if (looksLikeDateMap) return entries.map(([date, prices]) => ({ date, prices }));
      }
      return null;
    })();
    if (!snapshots) return { ok: false, error: 'Input is neither seriesBySymbol nor snapshots' };
    const { seriesBySymbol, symbols } = snapshotsToSeriesBySymbol(snapshots as any);
    return { ok: true, seriesBySymbol: seriesBySymbol as any, symbols };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function formatWeightsDiffLines(args: {
  before?: { cashPct01: number; weightsBySymbolPct01: Record<string, number> };
  after?: { cashPct01: number; weightsBySymbolPct01: Record<string, number> };
}): string[] {
  const before = args.before;
  const after = args.after;
  if (!before || !after) return ['(missing before/after snapshots)'];
  const syms = new Set<string>();
  for (const k of Object.keys(before.weightsBySymbolPct01 || {})) syms.add(k);
  for (const k of Object.keys(after.weightsBySymbolPct01 || {})) syms.add(k);
  const list = Array.from(syms).sort();
  const rows: string[] = [];
  rows.push(`cash: ${fmtPct01(before.cashPct01)} → ${fmtPct01(after.cashPct01)} (Δ ${fmtPct01(after.cashPct01 - before.cashPct01)})`);
  for (const sym of list) {
    const b = Number((before.weightsBySymbolPct01 as any)[sym] ?? 0);
    const a = Number((after.weightsBySymbolPct01 as any)[sym] ?? 0);
    rows.push(`${sym}: ${fmtPct01(b)} → ${fmtPct01(a)} (Δ ${fmtPct01(a - b)})`);
  }
  return rows;
}
