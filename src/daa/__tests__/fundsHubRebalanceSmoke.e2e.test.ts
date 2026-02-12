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
    }

    // Keep wizard storage in sync (export fallback path)
    storage.setItem("daa.wizard.rebalanceRequest", JSON.stringify(req));
    storage.setItem("daa.wizard.rebalanceResponse", JSON.stringify(resp));

    const at = "2026-02-12T12:00:00.000Z";
    const note = "ui:market/funds:paper-run";

    const log = appendRebalanceLog({
      storage,
      source: "core",
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
      orders: resp.orders,
      note,
      at,
    });
    expect(executed.ok).toBe(true);

    const report = buildLatestRebalanceRunReportV1(storage);
    expect(report.notes).toEqual([]);

    expect(report.run.rebalanceLogEntry?.note).toBe(note);
    expect(report.run.paperExecutionLogEntry?.note).toBe(note);

    expect(report.run.request).toEqual(req);
    expect(report.run.response).toEqual(resp);
  });
});
