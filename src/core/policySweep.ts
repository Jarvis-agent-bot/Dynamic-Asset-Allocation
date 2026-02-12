import { backtestDriftRebalance, type DriftRebalanceBacktestRequest } from "./backtestDriftRebalance";
import type { BacktestMetrics } from "./domain";
import { scoreMetrics, type ScoreWeights } from "./metrics";

export type PolicySweepGridV0 = {
  thresholdPct: number[];
  minTradeNotional: number[];
  cooldownSeconds: number[];

  // Optional ranking weights (defaults match scoreMetrics defaults).
  scoreWeights?: ScoreWeights;

  // Guardrails.
  maxRuns?: number;
  topN?: number;
};

export type PolicySweepRowV0 = {
  policy: {
    thresholdPct: number;
    minTradeNotional: number;
    cooldownSeconds: number;
  };

  metrics: BacktestMetrics;
  score: number;

  summary: {
    finalEquityAbs: number;
    rebalanceCount: number;
    turnoverNotional: number;
    warningCount: number;
  };
};

export type PolicySweepResultV0 = {
  schemaVersion: 1;
  runs: number;
  rows: PolicySweepRowV0[];
  top: PolicySweepRowV0[];
  best: PolicySweepRowV0 | null;
};

function toFinite(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function normalizeNumberList(xs: unknown, name: string): number[] {
  const arr = Array.isArray(xs) ? xs : xs == null ? [] : [xs];

  const out: number[] = [];
  for (const v of arr) {
    const n = toFinite(v, Number.NaN);
    if (!Number.isFinite(n)) continue;
    out.push(n);
  }

  if (!out.length) throw new Error(`${name} must be a non-empty number[]`);
  return out;
}

export function sweepDriftRebalancePolicy(baseReq: DriftRebalanceBacktestRequest, grid: PolicySweepGridV0): PolicySweepResultV0 {
  if (!baseReq || typeof baseReq !== "object") throw new Error("baseReq is required");

  const thresholdPct = normalizeNumberList(grid?.thresholdPct, "thresholdPct");
  const minTradeNotional = normalizeNumberList(grid?.minTradeNotional, "minTradeNotional").map((x) => Math.max(0, x));
  const cooldownSeconds = normalizeNumberList(grid?.cooldownSeconds, "cooldownSeconds").map((x) => Math.max(0, x));

  const maxRuns = Math.max(1, Math.floor(toFinite(grid?.maxRuns, 400)));
  const topN = Math.max(1, Math.floor(toFinite(grid?.topN, 50)));

  const totalCombos = thresholdPct.length * minTradeNotional.length * cooldownSeconds.length;
  if (totalCombos > maxRuns) {
    throw new Error(`sweep too large: combos=${totalCombos} exceeds maxRuns=${maxRuns}`);
  }

  const rows: PolicySweepRowV0[] = [];

  for (const t of thresholdPct) {
    for (const m of minTradeNotional) {
      for (const c of cooldownSeconds) {
        const res = backtestDriftRebalance({
          ...baseReq,
          policy: {
            thresholdPct: toFinite(t, 0),
            minTradeNotional: toFinite(m, 0),
            cooldownSeconds: toFinite(c, 0),
          },
        });

        const score = scoreMetrics(res.metrics, grid?.scoreWeights);

        rows.push({
          policy: {
            thresholdPct: toFinite(t, 0),
            minTradeNotional: toFinite(m, 0),
            cooldownSeconds: toFinite(c, 0),
          },
          metrics: res.metrics,
          score,
          summary: {
            finalEquityAbs: toFinite(res.summary?.finalEquityAbs, 0),
            rebalanceCount: Math.max(0, Math.floor(toFinite(res.summary?.rebalanceCount, 0))),
            turnoverNotional: toFinite(res.summary?.turnoverNotional, 0),
            warningCount: Array.isArray(res.warnings) ? res.warnings.length : 0,
          },
        });
      }
    }
  }

  rows.sort((a, b) => {
    // Higher score is better.
    if (b.score !== a.score) return b.score - a.score;

    // Tie-breakers to keep ordering stable.
    if (a.policy.thresholdPct !== b.policy.thresholdPct) return a.policy.thresholdPct - b.policy.thresholdPct;
    if (a.policy.minTradeNotional !== b.policy.minTradeNotional) return a.policy.minTradeNotional - b.policy.minTradeNotional;
    if (a.policy.cooldownSeconds !== b.policy.cooldownSeconds) return a.policy.cooldownSeconds - b.policy.cooldownSeconds;
    return 0;
  });

  const top = rows.slice(0, topN);

  return {
    schemaVersion: 1,
    runs: rows.length,
    rows,
    top,
    best: rows[0] ?? null,
  };
}
