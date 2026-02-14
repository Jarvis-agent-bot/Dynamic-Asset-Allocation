import type { RebalanceWhatIfV0 } from "../core/rebalanceWhatIf";

import type { RebalanceViolationV0 } from "./rebalanceViolationsV0";

export type ApprovalSummaryActionV0 = "dynamic-rebalance" | "cash-sweep";

export type ApprovalSummaryOrderV0 = {
  symbol: string;
  side: "BUY" | "SELL";
  notional: number;
  reason?: string;
};

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmtMoney(x: number, ccy: string | null | undefined) {
  const c = ccy ? ` ${ccy}` : "";
  if (!Number.isFinite(x)) return `NaN${c}`;
  return `${x.toFixed(2)}${c}`;
}

function fmtBps(x: number | null | undefined) {
  if (x === null || x === undefined) return "n/a";
  if (!Number.isFinite(x)) return "n/a";
  return x.toFixed(1);
}

function formatOrdersTableMd(orders: ApprovalSummaryOrderV0[]) {
  const safe = (s: string) => String(s ?? "").replace(/\|/g, " ");
  const rows = (orders ?? []).map(
    (o) => `| ${safe(o.symbol)} | ${safe(o.side)} | ${Number(o.notional).toFixed(2)} | ${safe(o.reason ?? "")} |`,
  );

  return ["| Symbol | Side | Notional | Why |", "| --- | --- | ---: | --- |", ...rows].join("\n");
}

function summarizeViolationCounts(v: RebalanceViolationV0[]) {
  let blockers = 0;
  let warnings = 0;
  let info = 0;

  for (const x of v ?? []) {
    if (x.level === "blocker") blockers += 1;
    else if (x.level === "warning") warnings += 1;
    else info += 1;
  }

  return { blockers, warnings, info };
}

export function buildRebalanceApprovalSummaryMarkdownV0(args: {
  atIso: string;
  action: ApprovalSummaryActionV0;
  baseCcy?: string | null;
  scheduleEnabled?: boolean;
  executionMode?: "dry-run" | "live";
  // The bps inputs are for disclosure; whatIf.feeBps/slippageBps is the effective bps used.
  feeBps?: number | null;
  slippageBpsBase?: number | null;
  slippageSensitivity?: number | string | null;
  slippageBpsEffective?: number | null;
  sellProceedsRouting?: string | null;
  overrideBlockers?: boolean;
  orders: ApprovalSummaryOrderV0[];
  whatIf?: RebalanceWhatIfV0 | null;
  violations?: RebalanceViolationV0[] | null;
}): string {
  const parts: string[] = [];

  const ccy = args.baseCcy ? String(args.baseCcy) : null;
  const scheduleEnabled = !!args.scheduleEnabled;
  const executionMode = args.executionMode ?? "dry-run";

  const violations = Array.isArray(args.violations) ? args.violations : [];
  const vCounts = summarizeViolationCounts(violations);

  const whatIf = args.whatIf ?? null;

  parts.push("# Rebalance run approval summary (v0)");
  parts.push("");

  const metaBits: string[] = [];
  metaBits.push(`at=${args.atIso}`);
  metaBits.push(`action=${args.action}`);
  metaBits.push(`schedule=${scheduleEnabled ? "enabled" : "disabled"}`);
  metaBits.push(`execution=${executionMode}`);
  if (ccy) metaBits.push(`ccy=${ccy}`);
  if (args.sellProceedsRouting) metaBits.push(`sellProceedsRouting=${args.sellProceedsRouting}`);
  if (args.overrideBlockers) metaBits.push(`overrideBlockers=true`);
  parts.push(metaBits.join("; "));
  parts.push("");

  parts.push("## Constraints / validation");
  parts.push("");
  parts.push(`blockers=${vCounts.blockers}; warnings=${vCounts.warnings}; info=${vCounts.info}`);
  parts.push("");

  const important = violations.filter((x) => x.level !== "info");
  if (important.length) {
    for (const v of important) {
      const head = `${v.level.toUpperCase()}: ${v.title}`;
      const detail = (v.details ?? []).filter(Boolean).join(" ");
      parts.push(`- ${head}${detail ? ` — ${detail}` : ""}`);
      if (v.suggestion) parts.push(`  suggestion: ${v.suggestion}`);
    }
  } else {
    parts.push("- No blockers detected for current inputs.");
  }
  parts.push("");

  parts.push("## Costs (estimated)");
  parts.push("");

  const feeBpsShown = toFiniteNumber(args.feeBps);
  const slipBaseShown = toFiniteNumber(args.slippageBpsBase);
  const slipSensShown = toFiniteNumber(args.slippageSensitivity);
  const slipEffShown = toFiniteNumber(args.slippageBpsEffective);

  if (whatIf) {
    parts.push(
      `turnover≈${fmtMoney(whatIf.turnoverNotional, ccy)}; fee≈${fmtMoney(whatIf.feeTotal, ccy)}; impact≈${fmtMoney(whatIf.slippageTotal, ccy)}; totalCost≈${fmtMoney(whatIf.costTotal, ccy)}`,
    );
    parts.push("");

    if (feeBpsShown !== null || slipBaseShown !== null || slipEffShown !== null) {
      const bpsBits: string[] = [];
      if (feeBpsShown !== null) bpsBits.push(`feeBps=${fmtBps(feeBpsShown)}`);
      if (slipBaseShown !== null) {
        const sens = slipSensShown !== null ? ` x sensitivity=${slipSensShown}` : "";
        bpsBits.push(`slippageBps=${fmtBps(slipBaseShown)}${sens}`);
      }
      if (slipEffShown !== null) bpsBits.push(`effectiveSlippageBps=${fmtBps(slipEffShown)}`);
      parts.push(`bps disclosure: ${bpsBits.join("; ")}`);
      parts.push("");
    }

    if (whatIf.warnings?.length) {
      parts.push(`warnings: ${whatIf.warnings.length}`);
      parts.push("");
      for (const w of whatIf.warnings.slice(0, 8)) parts.push(`- ${w}`);
      parts.push("");
    }
  } else {
    parts.push("(no what-if cost simulation available)");
    parts.push("");
  }

  parts.push("## Orders");
  parts.push("");
  parts.push(formatOrdersTableMd(args.orders ?? []));
  parts.push("");

  parts.push("## JSON (for audit / sharing)");
  parts.push("");
  parts.push("```json");
  parts.push(
    JSON.stringify(
      {
        at: args.atIso,
        action: args.action,
        scheduleEnabled,
        executionMode,
        baseCcy: ccy,
        sellProceedsRouting: args.sellProceedsRouting ?? null,
        overrideBlockers: !!args.overrideBlockers,
        orders: args.orders ?? [],
        costs: whatIf
          ? {
              turnoverNotional: whatIf.turnoverNotional,
              feeTotal: whatIf.feeTotal,
              slippageTotal: whatIf.slippageTotal,
              costTotal: whatIf.costTotal,
              feeBpsUsed: whatIf.feeBps,
              slippageBpsUsed: whatIf.slippageBps,
            }
          : null,
        violations: violations.map((v) => ({
          level: v.level,
          kind: v.kind,
          title: v.title,
          details: v.details,
          suggestion: v.suggestion ?? null,
        })),
      },
      null,
      2,
    ),
  );
  parts.push("```");
  parts.push("");

  return parts.join("\n");
}
