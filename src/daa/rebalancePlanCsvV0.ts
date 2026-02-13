export type RebalanceAllocationRowV0 = {
  id: string;
  label: string;
  // 0..1 (fraction of total equity).
  currentPct: number;
  targetPct: number;
  // Signed drift vs target (currentPct - targetPct).
  deltaPct: number;
};

export type RebalanceOrderLikeV0 = {
  symbol: string;
  side: string;
  notional: number;
  reason?: string;
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function fmtPct01ToPct100(x: number): string {
  if (!isFiniteNumber(x)) return "";
  return (x * 100).toFixed(4);
}

function fmtNumber(x: number): string {
  if (!isFiniteNumber(x)) return "";
  return x.toFixed(2);
}

function csvCell(x: unknown): string {
  if (x === null || x === undefined) return "";
  const s = String(x);
  // Quote if the cell contains special characters that break CSV parsing.
  if (/[\r\n",]/.test(s) || /^\s/.test(s) || /\s$/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function joinCsvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Build a single CSV that includes both allocations and orders.
 *
 * Rows are tagged via `type`:
 * - allocation: current/target/delta per asset id
 * - order: suggested order rows (with best-effort current/target/delta joined in)
 */
export function buildRebalancePlanCsvV0(args: {
  atIso: string;
  source?: string | null;
  baseCcy?: string | null;
  allocations: RebalanceAllocationRowV0[];
  orders: RebalanceOrderLikeV0[];
}): string {
  const atIso = String(args.atIso || "");
  const source = args.source ? String(args.source) : "";
  const baseCcy = args.baseCcy ? String(args.baseCcy) : "";

  const allocById = new Map<string, RebalanceAllocationRowV0>();
  for (const a of args.allocations || []) {
    if (!a || typeof a.id !== "string" || !a.id.trim()) continue;
    allocById.set(a.id, a);
  }

  const lines: string[] = [];
  // Excel hint for delimiter.
  lines.push("sep=,");

  lines.push(
    joinCsvLine([
      "at",
      "source",
      "baseCcy",
      "type",
      "id",
      "label",
      "current_pct",
      "target_pct",
      "delta_pct",
      "side",
      "notional",
      "reason",
    ]),
  );

  for (const a of args.allocations || []) {
    if (!a || typeof a.id !== "string" || !a.id.trim()) continue;
    lines.push(
      joinCsvLine([
        atIso,
        source,
        baseCcy,
        "allocation",
        a.id,
        a.label,
        fmtPct01ToPct100(a.currentPct),
        fmtPct01ToPct100(a.targetPct),
        fmtPct01ToPct100(a.deltaPct),
        "",
        "",
        "",
      ]),
    );
  }

  for (const o of args.orders || []) {
    if (!o || typeof o.symbol !== "string" || !o.symbol.trim()) continue;
    const a = allocById.get(o.symbol);

    lines.push(
      joinCsvLine([
        atIso,
        source,
        baseCcy,
        "order",
        o.symbol,
        a?.label ?? o.symbol,
        a ? fmtPct01ToPct100(a.currentPct) : "",
        a ? fmtPct01ToPct100(a.targetPct) : "",
        a ? fmtPct01ToPct100(a.deltaPct) : "",
        o.side,
        fmtNumber(o.notional),
        o.reason ?? "",
      ]),
    );
  }

  // Use CRLF for best spreadsheet compatibility.
  return lines.join("\r\n") + "\r\n";
}
