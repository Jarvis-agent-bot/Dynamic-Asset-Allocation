import type { RebalanceCoreResponse } from "../core/rebalanceCore";
import type { RebalanceWhatIfV0 } from "../core/rebalanceWhatIf";
import type { PreTradeCashCheckV0 } from "./preTradeCashCheckV0";

export type MinTradeDiagnosticsV0 = {
  candidateCount: number;
  producedCount: number;
  minNotional: number;
  lotStep: number;
  suppressedTop?: Array<{
    id: string;
    side: "BUY" | "SELL";
    rawNotional: number;
    roundedNotional: number;
  }>;
};

export type RebalanceViolationLevelV0 = "blocker" | "warning" | "info";

export type RebalanceViolationV0 = {
  level: RebalanceViolationLevelV0;
  kind: "minTrade" | "cashBuffer" | "sellBlocker" | "cashSettlement" | "maxTurnover" | "engineWarning";
  title: string;
  details: string[];
  suggestion?: string;
};

function fmtMoney(x: number, ccy: string | null) {
  const c = ccy ? ` ${ccy}` : "";
  if (!Number.isFinite(x)) return `NaN${c}`;
  return `${x.toFixed(2)}${c}`;
}

function pickWarningsByRegex(warnings: string[], re: RegExp) {
  return warnings.filter((w) => re.test(String(w)));
}

export function buildRebalanceViolationsV0(args: {
  baseCcy?: string | null;
  preTradeCashCheck?: PreTradeCashCheckV0 | null;
  coreResp?: RebalanceCoreResponse | null;
  whatIf?: RebalanceWhatIfV0 | null;
  // When set (>0): warn if whatIf.turnoverPctOfTotalBefore exceeds this value.
  maxTurnoverPct01?: number | null;
  naiveMinTradeDiag?: MinTradeDiagnosticsV0 | null;
}): RebalanceViolationV0[] {
  const out: RebalanceViolationV0[] = [];

  const baseCcy = args.baseCcy ? String(args.baseCcy) : null;

  const cashCheck = args.preTradeCashCheck ?? null;
  if (cashCheck?.blocking) {
    out.push({
      level: "blocker",
      kind: "cashSettlement",
      title: "Pre-trade cash/settlement check (BLOCKED)",
      details: [cashCheck.message],
    });
  }

  const core = args.coreResp ?? null;
  const coreWarningsRaw = Array.isArray(core?.warnings) ? core!.warnings.map((x) => String(x)) : [];

  const whatIf = args.whatIf ?? null;
  const whatIfWarnings = Array.isArray(whatIf?.warnings) ? whatIf!.warnings.map((x) => String(x)) : [];

  // Turnover guardrail (configured in funds hub UI).
  const maxTurnoverPct01Raw = typeof args.maxTurnoverPct01 === "number" ? args.maxTurnoverPct01 : null;
  const maxTurnoverPct01 =
    maxTurnoverPct01Raw !== null && Number.isFinite(maxTurnoverPct01Raw) && maxTurnoverPct01Raw > 0
      ? Math.min(1, Math.max(0, maxTurnoverPct01Raw))
      : null;

  if (maxTurnoverPct01 !== null && whatIf && Number.isFinite(whatIf.turnoverPctOfTotalBefore)) {
    const turnoverPct01 = whatIf.turnoverPctOfTotalBefore;
    if (turnoverPct01 > maxTurnoverPct01 + 1e-12) {
      out.push({
        level: "warning",
        kind: "maxTurnover",
        title: "Turnover guardrail exceeded",
        details: [
          `Max allowed turnover: ${(maxTurnoverPct01 * 100).toFixed(1)}% of totalBefore.`,
          `Projected turnover: ${(turnoverPct01 * 100).toFixed(1)}% (${fmtMoney(whatIf.turnoverNotional, baseCcy)}).`,
        ],
        suggestion: "Raise the max turnover guardrail, or reduce drift threshold / maxIn/maxOut so the plan turns over less.",
      });
    }
  }

  // Min trade / precision blockers.
  const diag = args.naiveMinTradeDiag ?? null;
  if (diag && diag.candidateCount > 0 && diag.producedCount === 0) {
    const ccy = baseCcy ? ` ${baseCcy}` : "";
    const examples = (diag.suppressedTop ?? [])
      .map((x) => `${x.side} ${x.id}: raw=${x.rawNotional.toFixed(2)}${ccy} -> rounded=${x.roundedNotional.toFixed(2)}${ccy}`)
      .slice(0, 3);

    out.push({
      level: "warning",
      kind: "minTrade",
      title: "Min trade / precision blocks all suggested trades",
      details: [
        `${diag.candidateCount} candidate trade(s) but 0 produced. minNotional=${diag.minNotional.toFixed(2)}${ccy}${diag.lotStep > 0 ? `; lotStep=${diag.lotStep.toFixed(2)}${ccy}` : ""}.`,
        ...(examples.length ? [`Examples: ${examples.join("; ")}`] : []),
      ],
      suggestion: "Lower policy.minTradeNotional (or increase equity/position sizes) so deltas exceed the minimum.",
    });
  }

  const minTradeWarnings = pickWarningsByRegex(coreWarningsRaw, /mintrad|min order size|lotStep|below min/i);
  if (minTradeWarnings.length) {
    out.push({
      level: "warning",
      kind: "minTrade",
      title: "Min trade / precision warnings",
      details: minTradeWarnings.slice(0, 6),
    });
  }

  // Sell-side blockers: caps or suppression.
  const sellBlockerWarnings = pickWarningsByRegex(coreWarningsRaw, /(maxOut|SELL orders may be suppressed|suppressed\s+SELL)/i);
  if (sellBlockerWarnings.length) {
    out.push({
      level: "warning",
      kind: "sellBlocker",
      title: "Sell-side constraints may block rebalancing",
      details: sellBlockerWarnings.slice(0, 6),
      suggestion: "Consider raising constraints.maxOut (or lowering minTradeNotional) if SELLs are being suppressed.",
    });
  }

  // Cash buffer: detect a meaningful implicit cash target (sum(targetWeights) < 1) and highlight mismatches.
  const targetSum = typeof core?.explain?.targetSumFinal === "number" ? core.explain.targetSumFinal : null;
  const equity = typeof core?.explain?.equity === "number" ? core.explain.equity : null;

  if (targetSum !== null && equity !== null && Number.isFinite(targetSum) && Number.isFinite(equity) && equity > 0) {
    const targetCashPct = Math.max(0, 1 - targetSum);

    // Only surface when the caller is actually aiming for a cash buffer.
    if (targetCashPct > 1e-6) {
      const cashAfter = whatIf && Number.isFinite(whatIf.totalAfter) && whatIf.totalAfter > 0 ? whatIf.cashAfter : null;
      const totalAfter = whatIf && Number.isFinite(whatIf.totalAfter) && whatIf.totalAfter > 0 ? whatIf.totalAfter : null;

      const projectedCashPct = cashAfter !== null && totalAfter !== null ? cashAfter / totalAfter : null;
      const driftPct = projectedCashPct !== null ? projectedCashPct - targetCashPct : null;

      const details: string[] = [];
      details.push(`Target cash buffer: ${(targetCashPct * 100).toFixed(1)}% (implicit; 1 - sum(targetWeights)).`);

      if (projectedCashPct !== null && driftPct !== null) {
        details.push(
          `Projected post-trade cash: ${(projectedCashPct * 100).toFixed(1)}% (drift ${(driftPct * 100).toFixed(1)}%).`
        );

        // Heuristic: >2% absolute deviation is worth surfacing.
        if (Math.abs(driftPct) > 0.02) {
          out.push({
            level: "warning",
            kind: "cashBuffer",
            title: "Cash buffer mismatch (post-trade cash deviates from target)",
            details,
            suggestion: "If you expect cash to hit the buffer, run Cash sweep (to buffer) or reduce lot sizing / minTradeNotional.",
          });
        } else {
          out.push({
            level: "info",
            kind: "cashBuffer",
            title: "Cash buffer target looks consistent",
            details,
          });
        }
      } else {
        // Fallback: no what-if projection; still surface the implicit target.
        out.push({
          level: "info",
          kind: "cashBuffer",
          title: "Cash buffer target",
          details,
        });
      }
    }
  }

  // Generic cash negativity warnings (what-if is fee/slippage aware).
  const cashWarnings = pickWarningsByRegex(whatIfWarnings, /(cashAfter < 0|insufficient cash)/i);
  if (cashWarnings.length) {
    out.push({
      level: "warning",
      kind: "cashSettlement",
      title: "What-if cash warnings",
      details: cashWarnings.slice(0, 4),
      suggestion: `Reduce BUY notional or add cash (post-cost cashAfter is low).`,
    });
  }

  // Surface a compact set of other engine warnings so users don't have to dig.
  const otherWarnings = coreWarningsRaw.filter(
    (w) => !minTradeWarnings.includes(w) && !sellBlockerWarnings.includes(w)
  );
  if (otherWarnings.length) {
    const ccy = baseCcy;
    const addl: string[] = [];

    // If account.cash differs materially from whatIf cashAfter, include a quick numeric anchor.
    if (cashCheck && whatIf) {
      addl.push(
        `cashStart=${fmtMoney(cashCheck.cashStart, ccy)}; projected cashAfter=${fmtMoney(whatIf.cashAfter, ccy)} (fee/slippage aware).`
      );
    }

    out.push({
      level: "info",
      kind: "engineWarning",
      title: "Engine warnings (details)",
      details: [...addl, ...otherWarnings.slice(0, 6)],
    });
  }

  return out;
}
