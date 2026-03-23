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

  it("只读模式下隐藏入金出金操作，并展示原因", async () => {
    mockListCashLedger.mockResolvedValue([]);

    render(
      <WorkbenchCashSection
        baseCurrency="USD"
        cashMutationsAllowed={false}
        readOnlyReason="当前现金由外部校准结果锁定。"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("现金流水（只读）")).toBeTruthy();
    });

    expect(screen.queryByText("入金")).toBeNull();
    expect(screen.queryByText("出金")).toBeNull();
    expect(screen.getByText("只读")).toBeTruthy();
    expect(screen.getByText("当前现金由外部校准结果锁定。")).toBeTruthy();
  });

  it("存在多个本地执行通道时会拆开展示资金分布", async () => {
    mockListCashLedger.mockResolvedValue([]);

    render(
      <WorkbenchCashSection
        baseCurrency="USD"
        cashMutationsAllowed
        accountBreakdown={[
          {
            venueKind: "sim",
            accountId: "READ-ONLY-1",
            label: "外部只读账户",
            baseCurrency: "USD",
            cash: 1200,
            investableCash: 1100,
            frozenCash: 100,
            totalEquity: 4500,
            cashMutationsAllowed: false,
            readOnlyReason: "余额由外部只读来源维护。",
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
      expect(screen.getByText("现金流水")).toBeTruthy();
    });

    expect(screen.getByText("分账户展示")).toBeTruthy();
    expect(screen.getByText("外部只读账户")).toBeTruthy();
    expect(screen.getByText("Crypto Paper / 本地")).toBeTruthy();
    expect(screen.getByText("账户 READ-ONLY-1")).toBeTruthy();
    expect(screen.getByText("现金 $1,200")).toBeTruthy();
    expect(screen.getByText("可投资 $260")).toBeTruthy();
    expect(screen.getByText("余额由外部只读来源维护。")).toBeTruthy();
    expect(screen.getAllByText("只读")).toHaveLength(1);
    expect(screen.getAllByText("可编辑").length).toBeGreaterThanOrEqual(1);
  });
});
