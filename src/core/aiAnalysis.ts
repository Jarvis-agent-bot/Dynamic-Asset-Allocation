import type { MarketEvent } from "./marketEvents";

import { isPlainObject } from "../daa/engineContracts";

import { buildMarketCitations, type MarketEventCitation } from "./marketCitations";

export type AiAnalysisAlternative = {
  name: string;
  constraintPatch: {
    maxPositionPct?: number;
    maxIn?: number;
    maxOut?: number;
  };
  rationale: string;
};

export type AiAnalysis = {
  summary: string;
  baselineNotes: string[];
  marketNotes: string[];
  // Traceable links back to Step2 events (id + ts + title [+ summary/url]).
  marketCitations: MarketEventCitation[];
  alternatives: AiAnalysisAlternative[];
  disclaimers: string[];
};

function num(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function asString(x: unknown): string {
  if (x === null || x === undefined) return "";
  return String(x);
}

function extractConstraints(req: unknown): {
  maxPositionPct: number | null;
  maxIn: number | null;
  maxOut: number | null;
} {
  if (!isPlainObject(req)) return { maxPositionPct: null, maxIn: null, maxOut: null };
  const mp = (req as any).money_plan;
  if (!isPlainObject(mp)) return { maxPositionPct: null, maxIn: null, maxOut: null };
  const c = (mp as any).constraints;
  if (!isPlainObject(c)) return { maxPositionPct: null, maxIn: null, maxOut: null };
  return {
    maxPositionPct: num((c as any).maxPositionPct),
    maxIn: num((c as any).maxIn),
    maxOut: num((c as any).maxOut),
  };
}

function extractOrders(resp: unknown): { symbol: string; side: string; notional: number }[] {
  if (!resp || typeof resp !== "object") return [];
  const raw = (resp as any).orders;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(Boolean)
    .map((o: any) => ({
      symbol: asString(o?.symbol),
      side: asString(o?.side),
      notional: Number(o?.notional ?? NaN),
    }))
    .filter((o) => o.symbol && o.side && Number.isFinite(o.notional));
}

function extractTargetWeights(resp: unknown): { id: string; targetPct: number }[] {
  if (!resp || typeof resp !== "object") return [];
  const r = resp as any;
  const raw = r.targetWeights ?? r.target_weights;

  if (Array.isArray(raw)) {
    return raw
      .filter(Boolean)
      .map((a: any) => ({
        id: asString(a?.id ?? a?.symbol),
        targetPct: Number(a?.targetPct ?? a?.target_pct ?? a?.weight ?? NaN),
      }))
      .filter((a) => a.id && Number.isFinite(a.targetPct));
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([id, v]) => ({ id, targetPct: Number(v ?? NaN) }))
      .filter((a) => a.id && Number.isFinite(a.targetPct));
  }

  return [];
}

function extractWarnings(resp: unknown): string[] {
  if (!resp || typeof resp !== "object") return [];
  const raw = (resp as any).warnings;
  if (!Array.isArray(raw)) return [];
  return raw.map(String);
}

function normalizeMarketEvents(events: unknown): MarketEvent[] {
  if (!Array.isArray(events)) return [];
  return events
    .filter(Boolean)
    .map((e: any) => ({
      id: asString(e?.id),
      source: e?.source === "twitter" || e?.source === "news" ? e.source : "news",
      ts: asString(e?.ts),
      title: asString(e?.title),
      summary: e?.summary === undefined ? undefined : asString(e?.summary),
      // v0 MarketEvent does not model sentiment/confidence; keep raw for future.
      symbols: Array.isArray(e?.symbols) ? e.symbols.map(String).filter(Boolean) : undefined,
      url: e?.url === undefined ? undefined : asString(e?.url),
      raw: e?.raw,
    }))
    .filter((e) => e.id && e.ts && e.title);
}

export function analyzeDaaRecommendation(input: {
  baselineRequest: unknown;
  baselineResponse: unknown;
  marketEvents: unknown;
}): AiAnalysis {
  const { baselineRequest, baselineResponse } = input;

  const constraints = extractConstraints(baselineRequest);
  const orders = extractOrders(baselineResponse);
  const weights = extractTargetWeights(baselineResponse);
  const warnings = extractWarnings(baselineResponse);
  const events = normalizeMarketEvents(input.marketEvents);

  const baselineNotes: string[] = [];
  baselineNotes.push(`Orders: ${orders.length ? orders.map((o) => `${o.side} ${o.symbol} (${o.notional.toFixed(0)})`).join(", ") : "none"}.`);
  if (warnings.length) baselineNotes.push(`Engine warnings: ${warnings.join("; ")}.`);

  const maxPos = constraints.maxPositionPct;
  if (maxPos !== null && weights.length) {
    const offenders = weights.filter((w) => w.targetPct > maxPos + 1e-9).map((w) => w.id);
    if (offenders.length) baselineNotes.push(`Target weights exceed maxPositionPct (${(maxPos * 100).toFixed(0)}%): ${offenders.join(", ")}.`);
  }

  const symbols = Array.from(new Set([...orders.map((o) => o.symbol), ...weights.map((w) => w.id)].filter(Boolean)));

  const marketCitations = buildMarketCitations({
    events,
    symbols: symbols.slice(0, 6),
    perSymbolLimit: 2,
  });

  const marketNotes: string[] = [];
  if (!events.length) {
    marketNotes.push("No MarketEvent input found. (Step2 market events are optional but improve explainability.)");
  } else if (!marketCitations.length) {
    marketNotes.push(`Market events loaded (${events.length}), but none matched the current symbols (${symbols.join(", ") || "<none>"}).`);
  } else {
    for (const c of marketCitations) {
      // Keep it human-readable, but still traceable by eventId.
      const summary = c.summary ? ` — ${c.summary}` : "";
      const url = c.url ? ` (${c.url})` : "";
      marketNotes.push(`${c.symbol}: [${c.eventId}] ${c.title}${summary}${url}`);
    }
  }

  const alternatives: AiAnalysisAlternative[] = [];

  // Relaxed: keep direction, loosen constraints so the baseline logic is less likely to be blocked.
  if (maxPos !== null || constraints.maxIn !== null || constraints.maxOut !== null) {
    const relaxedMaxPos = maxPos === null ? undefined : clamp(maxPos + 0.1, 0.05, 1);
    const relaxedMaxIn = constraints.maxIn === null ? undefined : clamp(constraints.maxIn * 1.5, 0, Number.POSITIVE_INFINITY);
    const relaxedMaxOut = constraints.maxOut === null ? undefined : clamp(constraints.maxOut * 1.5, 0, Number.POSITIVE_INFINITY);

    alternatives.push({
      name: "Relax constraints (more flexible)",
      constraintPatch: {
        maxPositionPct: relaxedMaxPos,
        maxIn: relaxedMaxIn,
        maxOut: relaxedMaxOut,
      },
      rationale:
        "If the baseline is producing tiny/no orders or warnings due to tight caps, loosening maxPositionPct and max in/out can reveal the underlying target-weight intent. Still not an execution instruction.",
    });

    const defensiveMaxPos = maxPos === null ? undefined : clamp(maxPos - 0.05, 0.01, 1);
    alternatives.push({
      name: "Tighten concentration (more defensive)",
      constraintPatch: {
        maxPositionPct: defensiveMaxPos,
      },
      rationale: "If market context looks noisy or mixed, a lower maxPositionPct reduces single-asset concentration risk.",
    });
  }

  const summaryPieces: string[] = [];
  if (orders.length) summaryPieces.push("Baseline produced actionable orders.");
  else summaryPieces.push("Baseline produced no orders (often due to constraints, already-close weights, or weak signals).");

  if (warnings.length) summaryPieces.push("Warnings present; treat results as draft.");
  if (events.length) summaryPieces.push("Market events included to enrich rationale.");

  return {
    summary: summaryPieces.join(" "),
    baselineNotes,
    marketNotes,
    marketCitations,
    alternatives,
    disclaimers: [
      "This is an analysis/explainability helper, not investment advice.",
      "It does not place trades or generate executable instructions.",
      "If you change constraints, re-run the simulator to see the resulting draft recommendation.",
    ],
  };
}
