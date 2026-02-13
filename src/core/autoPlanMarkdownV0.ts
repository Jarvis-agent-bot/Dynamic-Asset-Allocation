import type { DriftRebalanceBacktestResult, PortfolioWeightsSnapshotV0 } from "./backtestDriftRebalance";

function fmtPct01(x: number) {
  if (!Number.isFinite(x)) return "n/a";
  return `${(x * 100).toFixed(2)}%`;
}

function formatWeightsDiffLines(args: {
  before?: PortfolioWeightsSnapshotV0;
  after?: PortfolioWeightsSnapshotV0;
}): string[] {
  const before = args.before;
  const after = args.after;
  if (!before || !after) return ["(missing before/after snapshots)"];

  const syms = new Set<string>();
  for (const k of Object.keys(before.weightsBySymbolPct01 || {})) syms.add(k);
  for (const k of Object.keys(after.weightsBySymbolPct01 || {})) syms.add(k);
  const list = Array.from(syms).sort();

  const rows: string[] = [];
  rows.push(
    `cash: ${fmtPct01(before.cashPct01)} -> ${fmtPct01(after.cashPct01)} (d ${fmtPct01(after.cashPct01 - before.cashPct01)})`,
  );

  for (const sym of list) {
    const b = Number((before.weightsBySymbolPct01 as any)[sym] ?? 0);
    const a = Number((after.weightsBySymbolPct01 as any)[sym] ?? 0);
    rows.push(`${sym}: ${fmtPct01(b)} -> ${fmtPct01(a)} (d ${fmtPct01(a - b)})`);
  }

  return rows;
}

export function buildAutoPlanMarkdownV0(res: DriftRebalanceBacktestResult): string {
  const parts: string[] = [];

  parts.push("# Auto rebalance plan (v0)");
  parts.push("");
  parts.push(
    `rebalanceCount=${res.summary.rebalanceCount}; turnoverNotional=${res.summary.turnoverNotional.toFixed(2)}; equityAbs=${res.summary.initialEquityAbs.toFixed(2)} -> ${res.summary.finalEquityAbs.toFixed(2)}`,
  );
  parts.push("");

  if (res.warnings?.length) {
    parts.push(`warnings: ${res.warnings.length}`);
    parts.push("");
    parts.push("## Warnings");
    parts.push("");
    for (const w of res.warnings) parts.push(`- ${w}`);
    parts.push("");
  }

  if (res.states) {
    parts.push("## Overall weight diff");
    parts.push("");
    parts.push(...formatWeightsDiffLines({ before: res.states.initial, after: res.states.final }));
    parts.push("");
  }

  parts.push("## Events");
  parts.push("");

  for (const ev of res.events || []) {
    const stats: any = (ev as any).trigger?.stats ?? {};

    parts.push(`### ${ev.kind} @ ${ev.date}`);
    parts.push("");
    parts.push(
      `shouldRebalance=${String((ev as any).trigger?.shouldRebalance)}; maxAbsDriftPct=${fmtPct01(Number(stats.maxAbsDriftPct ?? Number.NaN))}; maxAbsDriftSymbol=${String(stats.maxAbsDriftSymbol ?? "")}`,
    );
    parts.push("");

    parts.push("Diff:");
    parts.push(...formatWeightsDiffLines({ before: (ev as any).before, after: (ev as any).after }).map((l) => `- ${l}`));
    parts.push("");

    parts.push("Orders:");
    parts.push("```json");
    parts.push(JSON.stringify((ev as any).orders ?? [], null, 2));
    parts.push("```");
    parts.push("");
  }

  return parts.join("\n");
}
