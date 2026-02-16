import { describe, expect, it } from "vitest";

import { buildRebalanceViolationsV0 } from "../rebalanceViolationsV0";

describe("rebalanceViolationsV0", () => {
  it("surfaces a blocking cash/settlement violation", () => {
    const v = buildRebalanceViolationsV0({
      baseCcy: "USD",
      preTradeCashCheck: {
        schemaVersion: 1,
        sellProceedsRoutingV0: "TARGET_CASH_BUCKET",
        cashStart: 0,
        buyNotional: 100,
        sellNotional: 0,
        cashAfter: -100,
        blocking: true,
        reasons: ["buyNotional_exceeds_settled_cash"],
        message: "blocked",
      },
    });

    expect(v.some((x) => x.level === "blocker" && x.kind === "cashSettlement")).toBe(true);
  });

  it("categorizes min-trade suppression diagnostics as a warning", () => {
    const v = buildRebalanceViolationsV0({
      naiveMinTradeDiag: {
        candidateCount: 3,
        producedCount: 0,
        minNotional: 10,
        lotStep: 10,
        suppressedTop: [{ id: "AAA", side: "SELL", rawNotional: 9, roundedNotional: 0 }],
      },
    });

    const mt = v.find((x) => x.kind === "minTrade");
    expect(mt?.level).toBe("warning");
    expect(mt?.details.join("\n")).toMatch(/candidate trade/);
  });

  it("extracts sell-side blockers from engine warnings", () => {
    const v = buildRebalanceViolationsV0({
      coreResp: {
        orders: [],
        targetWeights: [],
        warnings: [
          "warning: constraints.maxOut=50.00 < minTradeNotional=100.00; SELL orders may be suppressed.",
          "warning: minTradeNotional=100.00 blocks all trades; maxAbsDeltaNotional=10.00 (symbol=AAA).",
        ],
        explain: {
          equity: 100,
          cashStart: 0,
          cashAfterSells: 0,
          cashEnd: 0,
          targetSumInput: 1,
          targetSumFinal: 1,
          notes: [],
          currentValues: {},
          desiredValues: {},
          deltas: {},
        },
        trigger: {
          shouldRebalance: false,
          reasons: [],
          stats: {
            equity: 100,
            thresholdPct: 0,
            minTradeNotional: 100,
            cooldownSeconds: 0,
            maxAbsDriftPct: 0,
            maxAbsDriftSymbol: null,
            orderCount: 0,
            eligibleOrderCount: 0,
            eligibleNotionalSum: 0,
          },
        },
      },
    });

    expect(v.some((x) => x.kind === "sellBlocker" && x.level === "warning")).toBe(true);
    expect(v.some((x) => x.kind === "minTrade" && x.level === "warning")).toBe(true);
  });

  it("detects cash buffer mismatch when post-trade cash deviates from implicit target", () => {
    const v = buildRebalanceViolationsV0({
      baseCcy: "USD",
      coreResp: {
        orders: [],
        targetWeights: [],
        warnings: [],
        explain: {
          equity: 100,
          cashStart: 10,
          cashAfterSells: 10,
          cashEnd: 10,
          targetSumInput: 0.8,
          targetSumFinal: 0.8,
          notes: [],
          currentValues: {},
          desiredValues: {},
          deltas: {},
        },
        trigger: {
          shouldRebalance: true,
          reasons: ["trigger: ok"],
          stats: {
            equity: 100,
            thresholdPct: 0,
            minTradeNotional: 0,
            cooldownSeconds: 0,
            maxAbsDriftPct: 0,
            maxAbsDriftSymbol: null,
            orderCount: 0,
            eligibleOrderCount: 0,
            eligibleNotionalSum: 0,
          },
        },
      },
      whatIf: {
        schemaVersion: 1,
        feeBps: 0,
        slippageBps: 0,
        buyNotional: 0,
        sellNotional: 0,
        turnoverNotional: 0,
        turnoverPctOfTotalBefore: 0,
        costPct: 0,
        feeTotal: 0,
        slippageTotal: 0,
        costTotal: 0,
        feeBuyTotal: 0,
        feeSellTotal: 0,
        slippageBuyTotal: 0,
        slippageSellTotal: 0,
        costBuyTotal: 0,
        costSellTotal: 0,
        buyCashOutflow: 0,
        sellProceedsGross: 0,
        sellProceedsNet: 0,
        cashDelta: 50,
        totalBefore: 100,
        totalAfter: 100,
        cashBefore: 10,
        cashAfter: 60,
        warnings: [],
        rows: [],
      },
    });

    expect(v.some((x) => x.kind === "cashBuffer" && x.level === "warning")).toBe(true);
  });

  it("warns when turnover exceeds maxTurnoverPct01 guardrail", () => {
    const v = buildRebalanceViolationsV0({
      baseCcy: "USD",
      maxTurnoverPct01: 0.2,
      whatIf: {
        schemaVersion: 1,
        feeBps: 0,
        slippageBps: 0,
        buyNotional: 0,
        sellNotional: 0,
        turnoverNotional: 30,
        turnoverPctOfTotalBefore: 0.3,
        costPct: 0,
        feeTotal: 0,
        slippageTotal: 0,
        costTotal: 0,
        feeBuyTotal: 0,
        feeSellTotal: 0,
        slippageBuyTotal: 0,
        slippageSellTotal: 0,
        costBuyTotal: 0,
        costSellTotal: 0,
        buyCashOutflow: 0,
        sellProceedsGross: 0,
        sellProceedsNet: 0,
        cashDelta: 0,
        totalBefore: 100,
        totalAfter: 100,
        cashBefore: 0,
        cashAfter: 0,
        warnings: [],
        rows: [],
      },
    });

    expect(v.some((x) => x.kind === "maxTurnover" && x.level === "warning")).toBe(true);
  });
});
