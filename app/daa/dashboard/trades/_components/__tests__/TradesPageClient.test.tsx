// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/daa/dashboard/_hooks/useTradesModel", () => ({
  useTradesModel: vi.fn(),
}));

import type { TradesModel } from "@/app/daa/dashboard/_hooks/useTradesModel";
import { useTradesModel } from "@/app/daa/dashboard/_hooks/useTradesModel";
import TradesPageClient from "../TradesPageClient";

function createTradesModel(overrides: Partial<TradesModel> = {}): TradesModel {
  const cycles = overrides.cycles ?? [];
  const orders = overrides.orders ?? [];
  const reports = overrides.reports ?? [];

  return {
    loading: false,
    refreshing: false,
    error: "",
    load: vi.fn(),
    baseCurrency: "USD",
    cycles,
    orders,
    sortedReports: overrides.sortedReports ?? reports,
    reports,
    records: overrides.records ?? { cycles, orders },
    ledgerMeta: {
      ledgerStartTs: null,
      openingBalance: 0,
      archivedCycleCount: 0,
      archivedTradeCount: 0,
      archivedReportCount: 0,
    },
    completedCycleCount: 0,
    executedOrderCount: 0,
    executedOrderNotional: 0,
    cycleExecutedNotional: 0,
    manualExecutedNotional: 0,
    totalNotional: 0,
    realizedPnl: 0,
    latestActivityAt: null,
    expandedReportCycleId: null,
    setExpandedReportCycleId: vi.fn(),
    activeTab: "cycles",
    setActiveTab: vi.fn(),
    ...overrides,
  };
}

describe("TradesPageClient", () => {
  it("加载中时展示显式 loading，而不是默认 0 值空态", () => {
    vi.mocked(useTradesModel).mockReturnValue(createTradesModel({
      loading: true,
    }));

    render(<TradesPageClient />);

    expect(screen.getByText("正在加载交易记录…")).toBeTruthy();
    expect(screen.getByText(/正在读取订单与调仓周期历史/)).toBeTruthy();
    expect(screen.queryByText("订单记录")).toBeNull();
  });
});
