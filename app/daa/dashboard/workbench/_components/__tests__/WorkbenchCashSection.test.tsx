// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
