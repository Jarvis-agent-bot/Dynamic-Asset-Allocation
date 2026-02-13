import { describe, expect, it } from "vitest";

import { rebalanceCore } from "../../core/rebalanceCore";

import { getDefaultExecutionAdapterV0 } from "../executionAdapterV0";
import { appendRebalanceLog } from "../rebalanceLogStore";
import { buildLatestRebalanceRunReportV1 } from "../rebalanceReportExport";
import { isRebalanceCoreRequest } from "../rebalanceCoreContracts";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private m = new Map<string, string>();

  getItem(key: string): string | null {
    return this.m.has(key) ? (this.m.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.m.set(key, String(value));
  }
}

describe("funds hub rebalance e2e smoke", () => {
  it("generate orders -> review -> export (paper-run)", () => {
    const storage = new MemoryStorage();

    // Mirrors the Funds hub one-click path:
    // - generate suggested orders
    // - record a paper execution + rebalance log
    // - export a latest-run report
    const req = {
      account: { cash: 0 },
      holdings: { AAA: 10 },
      prices: { AAA: 10, BBB: 10 },
      targetWeights: {
        AAA: 0,
        BBB: 1,
      },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0, minTradeNotional: 0, cooldownSeconds: 0 },
    };

    expect(isRebalanceCoreRequest(req)).toBe(true);

    const resp = rebalanceCore(req);

    // Generate orders (engine output)
    expect(resp.trigger.shouldRebalance).toBe(true);
    expect(resp.orders.map((o) => `${o.side}:${o.symbol}:${o.notional}`)).toEqual(["SELL:AAA:100", "BUY:BBB:100"]);

    // Review (sanity of the shape that UI consumes)
    for (const o of resp.orders) {
      expect(typeof o.symbol).toBe("string");
      expect(o.side === "BUY" || o.side === "SELL").toBe(true);
      expect(Number.isFinite(o.notional)).toBe(true);
      expect(o.notional).not.toBe(0);

      // E2E UX: the funds hub "trade rationale" panel depends on per-order reasons.
      expect(typeof (o as any).reason).toBe("string");
      expect(String((o as any).reason || "").trim().length).toBeGreaterThan(0);
    }

    // Keep wizard storage in sync (export fallback path)
    storage.setItem("daa.wizard.rebalanceRequest", JSON.stringify(req));
    storage.setItem("daa.wizard.rebalanceResponse", JSON.stringify(resp));

    const at = "2026-02-12T12:00:00.000Z";
    const note = "ui:market/funds:paper-run";
    const runId = "rebalance_run_test_1";

    const log = appendRebalanceLog({
      storage,
      source: "core",
      runId,
      request: req,
      response: resp,
      note,
      at,
    });
    expect(log.ok).toBe(true);

    const exec = getDefaultExecutionAdapterV0();
    const executed = exec.executeOrders({
      storage,
      source: "rebalance-core",
      runId,
      orders: resp.orders,
      note,
      at,
    });
    expect(executed.ok).toBe(true);

    const report = buildLatestRebalanceRunReportV1(storage);
    expect(report.notes).toEqual([]);

    expect(report.run.rebalanceLogEntry?.note).toBe(note);
    expect(report.run.paperExecutionLogEntry?.note).toBe(note);

    expect(report.run.rebalanceLogEntry?.runId).toBe(runId);
    expect(report.run.paperExecutionLogEntry?.runId).toBe(runId);

    expect(report.run.request).toEqual(req);
    expect(report.run.response).toEqual(resp);
  });

  it("keeps cash buffer + lot rounding internally consistent", () => {
    // Model a cash buffer by making target weights sum to < 1, and ensure the core's
    // minTradeNotional (lot-step) rounding doesn't break the implied cash target.
    const req = {
      account: { cash: 90 },
      holdings: { AAA: 10 },
      prices: { AAA: 11, BBB: 10 },
      // Sum=0.666 => ~33.4% implicit cash buffer.
      targetWeights: {
        AAA: 0.333,
        BBB: 0.333,
      },
      constraints: { maxIn: 1e9, maxOut: 1e9, minNotional: 0.01 },
      policy: { thresholdPct: 0, minTradeNotional: 10, cooldownSeconds: 0 },
    };

    expect(isRebalanceCoreRequest(req)).toBe(true);

    const resp = rebalanceCore(req);
    expect(resp.trigger.shouldRebalance).toBe(true);

    const step = 10;
    for (const o of resp.orders) {
      const q = o.notional / step;
      expect(Math.abs(q - Math.round(q))).toBeLessThan(1e-9);
    }

    const equity = resp.explain.equity;
    const desiredCash = equity * Math.max(0, 1 - resp.explain.targetSumFinal);

    // Rounding can move us off the perfect target by up to 1 lot step.
    expect(Math.abs(resp.explain.cashEnd - desiredCash)).toBeLessThanOrEqual(step + 1e-6);
  });

  it("updates suggested orders when prices drift between runs", () => {
    const storage = new MemoryStorage();

    const note = "ui:market/funds:paper-run";
    const runId1 = "rebalance_run_test_drift_1";
    const runId2 = "rebalance_run_test_drift_2";

    const req1 = {
      account: { cash: 0 },
      holdings: { AAA: 10 },
      prices: { AAA: 10, BBB: 10 },
      targetWeights: {
        AAA: 0,
        BBB: 1,
      },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0, minTradeNotional: 0, cooldownSeconds: 0 },
    };

    expect(isRebalanceCoreRequest(req1)).toBe(true);

    const resp1 = rebalanceCore(req1);
    expect(resp1.trigger.shouldRebalance).toBe(true);
    expect(resp1.orders.map((o) => `${o.side}:${o.symbol}:${o.notional}`)).toEqual(["SELL:AAA:100", "BUY:BBB:100"]);

    storage.setItem("daa.wizard.rebalanceRequest", JSON.stringify(req1));
    storage.setItem("daa.wizard.rebalanceResponse", JSON.stringify(resp1));

    const at1 = "2026-02-12T12:00:00.000Z";
    const log1 = appendRebalanceLog({
      storage,
      source: "core",
      runId: runId1,
      request: req1,
      response: resp1,
      note,
      at: at1,
    });
    expect(log1.ok).toBe(true);

    // Simulate market drift during a multi-step UI flow (review/confirm) and ensure
    // the suggested trade set updates when we rerun the engine.
    const req2 = {
      ...req1,
      prices: { AAA: 12, BBB: 8 },
    };

    const resp2 = rebalanceCore(req2);
    expect(resp2.trigger.shouldRebalance).toBe(true);
    expect(resp2.orders.map((o) => `${o.side}:${o.symbol}:${o.notional}`)).toEqual(["SELL:AAA:120", "BUY:BBB:120"]);

    // Ensure we do not keep showing stale suggestions.
    expect(resp2.orders.map((o) => o.notional)).not.toEqual(resp1.orders.map((o) => o.notional));

    storage.setItem("daa.wizard.rebalanceRequest", JSON.stringify(req2));
    storage.setItem("daa.wizard.rebalanceResponse", JSON.stringify(resp2));

    const at2 = "2026-02-12T12:01:00.000Z";
    const log2 = appendRebalanceLog({
      storage,
      source: "core",
      runId: runId2,
      request: req2,
      response: resp2,
      note,
      at: at2,
    });
    expect(log2.ok).toBe(true);

    const exec = getDefaultExecutionAdapterV0();
    const executed = exec.executeOrders({
      storage,
      source: "rebalance-core",
      runId: runId2,
      orders: resp2.orders,
      note,
      at: at2,
    });
    expect(executed.ok).toBe(true);

    const report = buildLatestRebalanceRunReportV1(storage);
    expect(report.notes).toEqual([]);
    expect(report.run.request).toEqual(req2);
    expect(report.run.response).toEqual(resp2);
    expect(report.run.rebalanceLogEntry?.runId).toBe(runId2);
    expect(report.run.paperExecutionLogEntry?.runId).toBe(runId2);
  });

  it("surfaces exchange min order size rounding as core warnings", () => {
    const req = {
      account: { cash: 0 },
      holdings: { AAA: 27 },
      prices: { AAA: 10, BBB: 10 },
      targetWeights: {
        AAA: 0,
        BBB: 1,
      },
      constraints: { maxIn: 1e9, maxOut: 1e9 },
      policy: { thresholdPct: 0, minTradeNotional: 100, cooldownSeconds: 0 },
    };

    expect(isRebalanceCoreRequest(req)).toBe(true);

    const resp = rebalanceCore(req);
    expect(resp.orders.map((o) => `${o.side}:${o.symbol}:${o.notional}`)).toEqual(["SELL:AAA:200", "BUY:BBB:200"]);
    expect(resp.warnings.join("\n")).toMatch(/min order size:/i);
    expect(resp.warnings.join("\n")).toMatch(/skipped 70\.00/i);
  });
});
