import { afterEach, describe, expect, it } from "vitest";

import {
  LS_PORTFOLIO_STATE,
  loadPortfolioStateV1,
  savePortfolioStateV1,
} from "../../../app/daa/portfolioStateStore";
import {
  LS_TARGET_WEIGHTS,
  loadTargetWeightsStateV1,
} from "../../../app/daa/targetWeightsStore";
import { LS_PRICE_SNAPSHOT, loadPriceSnapshotV1 } from "../../../app/daa/priceSnapshotStore";
import { LS_UNIFIED_INPUT_V1 } from "../../../app/daa/unifiedInputStore";

class MemStorage {
  private m = new Map<string, string>();

  getItem(key: string) {
    return this.m.has(key) ? this.m.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.m.set(key, String(value));
  }

  removeItem(key: string) {
    this.m.delete(key);
  }
}

function installWindow(storage: MemStorage) {
  (globalThis as any).window = {
    localStorage: storage,
    dispatchEvent: () => true,
  };
}

afterEach(() => {
  delete (globalThis as any).window;
});

function seedUnified(storage: MemStorage, patch: Record<string, unknown>) {
  storage.setItem(
    LS_UNIFIED_INPUT_V1,
    JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-02-28T00:00:00.000Z",
      moneyPlan: null,
      marketEvents: null,
      humanProfile: null,
      portfolioState: null,
      targetWeightsState: null,
      priceSnapshot: null,
      unifiedRequestDraft: null,
      ...patch,
    }),
  );
}

describe("unified store read priority", () => {
  it("portfolioState prefers unified slice over legacy key", () => {
    const storage = new MemStorage();
    installWindow(storage);

    seedUnified(storage, {
      portfolioState: {
        schemaVersion: 1,
        updatedAt: "2026-02-28T00:00:00.000Z",
        positions: { SPY: { qty: 9 } },
        cash: 100,
      },
    });

    storage.setItem(
      LS_PORTFOLIO_STATE,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-02-01T00:00:00.000Z",
        positions: { SPY: { qty: 1 } },
        cash: 0,
      }),
    );

    const st = loadPortfolioStateV1();
    expect(st.positions.SPY.qty).toBe(9);
    expect(st.cash).toBe(100);
  });

  it("targetWeights and priceSnapshot prefer unified slices", () => {
    const storage = new MemStorage();
    installWindow(storage);

    seedUnified(storage, {
      targetWeightsState: {
        schemaVersion: 1,
        updatedAt: "2026-02-28T00:00:00.000Z",
        targetWeights: [{ id: "QQQ", label: "QQQ", targetPct: 0.7 }],
      },
      priceSnapshot: {
        schemaVersion: 1,
        updatedAt: "2026-02-28T00:00:00.000Z",
        prices: { QQQ: { price: 500 } },
      },
    });

    storage.setItem(
      LS_TARGET_WEIGHTS,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-02-01T00:00:00.000Z",
        targetWeights: [{ id: "SPY", label: "SPY", targetPct: 0.3 }],
      }),
    );
    storage.setItem(
      LS_PRICE_SNAPSHOT,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-02-01T00:00:00.000Z",
        prices: { SPY: { price: 400 } },
      }),
    );

    const tw = loadTargetWeightsStateV1();
    const px = loadPriceSnapshotV1();

    expect(tw.targetWeights).toEqual([{ id: "QQQ", label: "QQQ", targetPct: 0.7 }]);
    expect(px.prices.QQQ.price).toBe(500);
    expect(px.prices.SPY).toBeUndefined();
  });

  it("ignores legacy standalone keys when unified slice is missing", () => {
    const storage = new MemStorage();
    installWindow(storage);

    storage.setItem(
      LS_PORTFOLIO_STATE,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-02-01T00:00:00.000Z",
        positions: { SPY: { qty: 3 } },
        cash: 99,
      }),
    );
    storage.setItem(
      LS_TARGET_WEIGHTS,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-02-01T00:00:00.000Z",
        targetWeights: [{ id: "SPY", label: "SPY", targetPct: 0.8 }],
      }),
    );
    storage.setItem(
      LS_PRICE_SNAPSHOT,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: "2026-02-01T00:00:00.000Z",
        prices: { SPY: { price: 400 } },
      }),
    );

    const portfolio = loadPortfolioStateV1();
    const target = loadTargetWeightsStateV1();
    const snapshot = loadPriceSnapshotV1();

    expect(portfolio.positions.SPY).toBeUndefined();
    expect(portfolio.cash).toBe(0);
    expect(target.targetWeights).toEqual([]);
    expect(snapshot.prices.SPY).toBeUndefined();
  });

  it("savePortfolioStateV1 clears deprecated holdings key", () => {
    const storage = new MemStorage();
    installWindow(storage);

    storage.setItem("holdings", JSON.stringify({ SPY: { share: 1, cost: 1 } }));

    savePortfolioStateV1({
      schemaVersion: 1,
      updatedAt: "2026-02-28T00:00:00.000Z",
      positions: { SPY: { qty: 5 } },
      cash: 0,
    });

    expect(storage.getItem("holdings")).toBeNull();
  });
});
