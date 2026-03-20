// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkbenchCashSection } from "../WorkbenchCashSection";

const mockListCashLedger = vi.fn();
const mockAppendCashLedgerEntry = vi.fn();

vi.mock("@/src/daa/modules/store/storeApi", () => ({
  listCashLedger: (...args: unknown[]) => mockListCashLedger(...args),
  appendCashLedgerEntry: (...args: unknown[]) => mockAppendCashLedgerEntry(...args),
}));

describe("WorkbenchCashSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("折算后金额使用账户基准币展示，并保留原币说明", async () => {
    mockListCashLedger.mockResolvedValue([
      {
        id: "cash-1",
        ts: "2026-03-19T10:00:00.000Z",
        side: "deposit",
        amount: 100,
        baseCurrency: "EUR",
        amountInAccountBase: 108,
        accountBaseCurrency: "USD",
        entryKind: "manual",
        note: "test fx deposit",
      },
    ]);

    render(<WorkbenchCashSection baseCurrency="USD" />);

    await waitFor(() => {
      expect(screen.getByText("$108")).toBeTruthy();
    });

    expect(screen.getByText("原币 €100")).toBeTruthy();
    expect(screen.queryByText("€108")).toBeNull();
  });

  it("broker 模式下隐藏入金出金操作，并提示只读来源", async () => {
    mockListCashLedger.mockResolvedValue([]);

    render(
      <WorkbenchCashSection
        baseCurrency="USD"
        accountSource="broker"
        cashMutationsAllowed={false}
        brokerKind="ibkr_paper"
        brokerAccountId="DU123456"
        readOnlyReason="余额以券商快照为准。"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("现金流水（只读）")).toBeTruthy();
    });

    expect(screen.queryByText("入金")).toBeNull();
    expect(screen.queryByText("出金")).toBeNull();
    expect(screen.getByText("券商驱动 / 只读")).toBeTruthy();
    expect(screen.getByText("余额以券商快照为准。")).toBeTruthy();
  });

  it("hybrid 模式下会拆开展示各资金来源，并区分只读与可编辑账户", async () => {
    mockListCashLedger.mockResolvedValue([]);

    render(
      <WorkbenchCashSection
        baseCurrency="USD"
        accountSource="hybrid"
        cashMutationsAllowed
        accountBreakdown={[
          {
            venueKind: "ibkr_paper",
            accountId: "DU123456",
            label: "IBKR 模拟盘",
            baseCurrency: "USD",
            cash: 1200,
            investableCash: 1100,
            frozenCash: 100,
            totalEquity: 4500,
            cashMutationsAllowed: false,
            readOnlyReason: "以券商快照为准。",
          },
          {
            venueKind: "crypto_paper",
            accountId: null,
            label: "Crypto Paper / 本地",
            baseCurrency: "USD",
            cash: 300,
            investableCash: 260,
            frozenCash: 40,
            totalEquity: 900,
            cashMutationsAllowed: true,
            readOnlyReason: null,
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("现金与资金流水")).toBeTruthy();
    });

    expect(screen.getAllByText("聚合账户").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("IBKR 模拟盘")).toBeTruthy();
    expect(screen.getByText("Crypto Paper / 本地")).toBeTruthy();
    expect(screen.getByText("账户 DU123456")).toBeTruthy();
    expect(screen.getByText("现金 $1,200")).toBeTruthy();
    expect(screen.getByText("可投资 $260")).toBeTruthy();
    expect(screen.getByText("以券商快照为准。")).toBeTruthy();
    expect(screen.getAllByText("只读")).toHaveLength(1);
    expect(screen.getAllByText("可编辑").length).toBeGreaterThanOrEqual(1);
  });
});
